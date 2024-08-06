const express = require('express');
const path = require('path');
const os = require('os');
const si = require('systeminformation');
const fs = require('fs').promises;
const { execSync } = require('child_process');
const netstat = require('node-netstat');
const osUtils = require('os-utils'); // A utility for fetching CPU usage

const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static('public'));

let previousNetworkStats = {};

app.get('/api/system-info', async (req, res) => {
    try {
        const selectedTiles = req.query.tiles ? req.query.tiles.split(',') : [];
        const systemInfo = {};

        if (selectedTiles.includes('systemInfo')) {
            const [cpu, osInfo, processes] = await Promise.all([
                si.cpu(),
                si.osInfo(),
                si.processes()
            ]);

            systemInfo.system_info = {
                distro: `${osInfo.distro} ${osInfo.release}`,
                kernel: `${osInfo.kernel} ${osInfo.kernelVersion}`,
                uptime: formatUptime(os.uptime()),
                cpu: `${cpu.manufacturer} ${cpu.brand} (${cpu.cores} vCPU)`,
                load: `${os.loadavg()[0].toFixed(2)} (1m), ${os.loadavg()[1].toFixed(2)} (5m), ${os.loadavg()[2].toFixed(2)} (15m)`,
                processes: `${processes.all} (total)`,
            };
        }

        if (selectedTiles.includes('ipAddresses')) {
            systemInfo.ip_addresses = await getNetworkInterfaces();
        }

        if (selectedTiles.includes('docker')) {
            systemInfo.docker = getDockerInfo();
        }

        if (selectedTiles.includes('memoryUsage')) {
            const mem = await si.mem();
            const processes = await si.processes();
            const totalMemory = mem.total;
            const memoryUsage = processes.list
                .sort((a, b) => b.memRss - a.memRss)
                .slice(0, 10)
                .map(process => ({
                    name: process.name,
                    memoryUsage: process.memRss,
                    percentage: (process.memRss / totalMemory * 100).toFixed(2)
                }));

            systemInfo.memory_usage = {
                total: formatBytes(mem.total),
                used: `${((mem.used / mem.total) * 100).toFixed(0)}%`,
                free: formatBytes(mem.free),
                applications: memoryUsage
            };
        }

        if (selectedTiles.includes('diskSpaceUsage')) {
            systemInfo.disk_space_usage = await getDiskSpaceUsage();
        }

        if (selectedTiles.includes('thermal')) {
            systemInfo.thermals = await getThermalInfo();
        }

        if (selectedTiles.includes('physicalDrives')) {
            systemInfo.physical_drives = await getPhysicalDrives();
        }

        if (selectedTiles.includes('cpuUsage')) {
            const processes = await si.processes();
            const cpuUsage = processes.list
                .sort((a, b) => b.cpu - a.cpu)
                .slice(0, 10)
                .map(process => ({
                    name: process.name,
                    cpuUsage: process.cpu
                }));
            
            systemInfo.cpu_usage = cpuUsage;
        }

        res.json(systemInfo);
    } catch (error) {
        console.error('Error fetching system info:', error);
        res.status(500).json({ error: 'Failed to fetch system information' });
    }
});

app.post('/api/docker/:action', (req, res) => {
    const { action } = req.params;
    const { containerName } = req.body;

    if (!containerName) {
        return res.status(400).json({ error: 'Container name is required' });
    }

    try {
        switch (action) {
            case 'start':
                execSync(`docker start ${containerName}`);
                break;
            case 'stop':
                execSync(`docker stop ${containerName}`);
                break;
            case 'restart':
                execSync(`docker restart ${containerName}`);
                break;
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
        res.json({ success: true, message: `Container ${containerName} ${action}ed successfully` });
    } catch (error) {
        console.error(`Error ${action}ing container:`, error);
        res.status(500).json({ error: `Failed to ${action} container: ${error.message}` });
    }
});

function formatUptime(uptime) {
    const seconds = Math.floor(uptime % 60);
    const minutes = Math.floor((uptime / 60) % 60);
    const hours = Math.floor((uptime / (60 * 60)) % 24);
    const days = Math.floor(uptime / (60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
}

function formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

async function getNetworkInterfaces() {
    const networkInterfaces = await si.networkInterfaces();
    const networkStats = await si.networkStats();

    const interfaces = networkInterfaces
        .filter(iface => iface.ip4 !== '127.0.0.1' && iface.ip4 !== '')
        .map(iface => {
            const stats = networkStats.find(stat => stat.iface === iface.iface);

            let uploadRate = 'N/A';
            let downloadRate = 'N/A';

            if (stats) {
                const prevStats = previousNetworkStats[iface.iface] || { rx_bytes: 0, tx_bytes: 0, timestamp: Date.now() };

                const timeDiff = (Date.now() - prevStats.timestamp) / 1000; // time difference in seconds
                uploadRate = ((stats.tx_bytes - prevStats.tx_bytes) / timeDiff / 1024).toFixed(2); // KB/s
                downloadRate = ((stats.rx_bytes - prevStats.rx_bytes) / timeDiff / 1024).toFixed(2); // KB/s

                previousNetworkStats[iface.iface] = {
                    rx_bytes: stats.rx_bytes,
                    tx_bytes: stats.tx_bytes,
                    timestamp: Date.now()
                };
            }

            return {
                name: iface.iface,
                ip: iface.ip4,
                uploadRate: uploadRate,
                downloadRate: downloadRate
            };
        });

    return interfaces;
}

function getDockerInfo() {
    try {
        const containers = execSync('docker ps -a --format "{{.Names}},{{.Status}},{{.Image}}"').toString().trim().split('\n')
            .map(line => {
                const [name, status, image] = line.split(',');
                return { name, status, image };
            });

        const images = execSync('docker images --format "{{.Repository}}:{{.Tag}}"').toString().trim().split('\n');

        return {
            containers,
            images,
            runningContainers: containers.filter(c => c.status.startsWith('Up')).length,
            totalContainers: containers.length,
            totalImages: images.length
        };
    } catch (error) {
        console.error('Error fetching Docker info:', error);
        return {
            containers: [],
            images: [],
            runningContainers: 0,
            totalContainers: 0,
            totalImages: 0
        };
    }
}

async function getThermalInfo() {
    try {
        const thermalZones = await fs.readdir('/sys/class/thermal');
        const thermals = [];

        for (const zone of thermalZones) {
            if (zone.startsWith('thermal_zone')) {
                const type = await fs.readFile(`/sys/class/thermal/${zone}/type`, 'utf8');
                const temp = await fs.readFile(`/sys/class/thermal/${zone}/temp`, 'utf8');
                thermals.push({
                    type: type.trim(),
                    temp: (parseInt(temp) / 1000).toFixed(1)
                });
            }
        }

        return thermals;
    } catch (error) {
        console.error('Error reading thermal information:', error);
        return [];
    }
}

async function getDiskSpaceUsage() {
    try {
        const dfOutput = execSync('df --block-size=1K -x squashfs -x tmpfs -x devtmpfs -x overlay --output=target,pcent,size').toString();
        const lines = dfOutput.split('\n').slice(1); // Skip the header line

        return lines
            .filter(line => line.trim() !== '')
            .map(line => {
                const [target, pcent, size] = line.trim().split(/\s+/);
                return {
                    filesystem: target,
                    used: pcent,
                    size: formatBytes(parseInt(size) * 1024) // Convert KiB to bytes
                };
            })
            .sort((a, b) => a.filesystem.localeCompare(b.filesystem));
    } catch (error) {
        console.error('Error getting disk space usage:', error);
        return [];
    }
}

async function getPhysicalDrives() {
    try {
        const lsblkOutput = execSync('lsblk --json --bytes --output PATH,NAME,MODEL,SERIAL,REV,SIZE,TYPE,TRAN,LABEL,FSTYPE').toString();
        const lsblkData = JSON.parse(lsblkOutput);

        const drives = lsblkData.blockdevices.filter(device => device.type === "disk");

        const driveInfo = await Promise.all(drives.map(async (drive) => {
            const smartInfo = await getSmartInfo(drive.path);
            return {
                device: drive.name,
                partitions: getPartitions(drive),
                tran: drive.tran || '',
                model: smartInfo.model || drive.model || '',
                size: smartInfo.size || formatBytes(parseInt(drive.size)),
                serial: drive.serial || '',
                rev: drive.rev || '',
                temp: smartInfo.temp,
                health: smartInfo.health,
                powerOn: smartInfo.powerOn,
                state: smartInfo.state,
                rotation_rate: smartInfo.rotation_rate
            };
        }));

        return driveInfo;
    } catch (error) {
        console.error('Error getting physical drives:', error);
        return [];
    }
}

function getPartitions(drive) {
    if (!drive.children) return '';
    return drive.children
        .filter(child => child.type === 'part')
        .map(part => `${part.name}[${part.fstype || ''}:${part.label || ''}]`)
        .join(', ')
        .replace(/\[:]/g, '[')
        .replace(/:\]/g, ']')
        .replace(/\[\]/g, '');
}

async function getSmartInfo(drivePath) {
    try {
        const smartctlOutput = execSync(`sudo smartctl -n standby -xj ${drivePath}`, { encoding: 'utf8' });
        return parseSmartctlOutput(smartctlOutput);
    } catch (error) {
        console.error(`Error getting SMART info for ${drivePath}:`, error.message);
        if (error.stdout) {
            console.log('Smartctl output:', error.stdout);
            return parseSmartctlOutput(error.stdout);
        }
        return getFallbackDriveInfo(drivePath);
    }
}

function parseSmartctlOutput(output) {
    try {
        const smartData = JSON.parse(output);
        return {
            state: smartData.power_mode || 'unknown',
            temp: smartData.temperature ? smartData.temperature.current : null,
            health: smartData.smart_status && smartData.smart_status.passed ? 'ok' : 'unknown',
            powerOn: smartData.power_on_time ? smartData.power_on_time.hours : null,
            model: smartData.model_name || smartData.scsi_model_name || null,
            size: smartData.user_capacity ? formatBytes(smartData.user_capacity.bytes) : null,
            rotation_rate: smartData.rotation_rate || null
        };
    } catch (parseError) {
        console.error('Error parsing smartctl output:', parseError);
        return {
            state: 'unknown',
            temp: null,
            health: 'unknown',
            powerOn: null,
            model: null,
            size: null,
            rotation_rate: null
        };
    }
}

function getFallbackDriveInfo(drivePath) {
    try {
        const lsblkOutput = execSync(`lsblk -ndo MODEL,SIZE,STATE ${drivePath}`, { encoding: 'utf8' });
        const [model, size, state] = lsblkOutput.trim().split(/\s+/);
        return {
            state: state || 'unknown',
            temp: null,
            health: 'unknown',
            powerOn: null,
            model,
            size,
            rotation_rate: null
        };
    } catch (fallbackError) {
        console.error(`Error getting fallback info for ${drivePath}:`, fallbackError);
        return {
            state: 'unknown',
            temp: null,
            health: 'unknown',
            powerOn: null,
            model: 'Unknown',
            size: 'Unknown',
            rotation_rate: null
        };
    }
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
