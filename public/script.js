let memoryChart;

const lightModeVars = {
    '--bg-color': '#ffffff',
    '--text-color': '#333333',
    '--card-bg-color': '#f4f4f4',
    '--card-shadow': '0 4px 6px rgba(0, 0, 0, 0.1)',
    '--border-color': '#3498db',
    '--accent-color': '#2980b9',
    '--item-bg-color': '#e0e0e0',
    '--hover-bg-color': 'rgba(0, 0, 0, 0.075)',
};

const darkModeVars = {
    '--bg-color': '#1a1a1a',
    '--text-color': '#f0f0f0',
    '--card-bg-color': '#2c2c2c',
    '--card-shadow': '0 4px 6px rgba(255, 255, 255, 0.1)',
    '--border-color': '#4a4a4a',
    '--accent-color': '#64b5f6',
    '--item-bg-color': '#3a3a3a',
    '--hover-bg-color': 'rgba(255, 255, 255, 0.1)',
};

function createTile(title, content) {
    return `
        <div class="card">
            <h2>${title}</h2>
            ${content}
        </div>
    `;
}

function createInfoItems(obj) {
    return Object.entries(obj).map(([key, value]) => `
        <div class="info-item">
            <strong>${key}:</strong> ${value}
        </div>
    `).join('');
}

function createSystemInfoTile(data) {
    return createTile('System Info', createInfoItems(data.system_info));
}

function createIPAddressesTile(data) {
    const ipContent = data.ip_addresses.map(iface => `
        <div class="ip-info">
            <strong>${iface.name}:</strong> ${iface.ip}
            <div class="network-stats">
                <span class="upload-rate">
                    <i class="fas fa-arrow-up"></i> ${iface.uploadRate} KB/s
                </span>
                <span class="download-rate">
                    <i class="fas fa-arrow-down"></i> ${iface.downloadRate} KB/s
                </span>
            </div>
        </div>
    `).join('');

    return createTile('Network Stats', ipContent);
}

function createDockerTile(data) {
    const dockerContent = `
        <div class="info-item"><strong>Running Containers:</strong> ${data.docker.runningContainers}</div>
        <div class="info-item"><strong>Total Containers:</strong> ${data.docker.totalContainers}</div>
        <div class="expandable-header">Containers:</div>
        <div class="expandable-content">
            <ul class="container-list">
                ${data.docker.containers.map(container => `
                    <li class="container-item">
                        <span class="container-name">${container.name}</span>
                        <span class="container-status">${container.status}</span>
                        <div class="container-controls">
                            <button class="btn btn-start" onclick="controlContainer('start', '${container.name}')"><i class="fas fa-play"></i></button>
                            <button class="btn btn-stop" onclick="controlContainer('stop', '${container.name}')"><i class="fas fa-stop"></i></button>
                            <button class="btn btn-restart" onclick="controlContainer('restart', '${container.name}')"><i class="fas fa-sync-alt"></i></button>
                        </div>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
    return createTile('Docker', dockerContent);
}

function createMemoryUsageTile(data) {
    const totalMemory = parseFloat(data.memory_usage.total.replace(' GB', '')) * 1024 * 1024 * 1024; // Convert GB to bytes
    const usedPercentage = parseFloat(data.memory_usage.used.replace('%', ''));
    const freePercentage = 100 - usedPercentage;

    const memoryContent = `
        <div class="info-item">
            <div class="memory-usage-bar">
                <div class="memory-usage-segment memory-usage-used" style="width: ${usedPercentage}%;"></div>
                <div class="memory-usage-segment memory-usage-free" style="width: ${freePercentage}%;"></div>
            </div>
            <div><strong>Free:</strong> ${data.memory_usage.free} <strong>Total:</strong> ${data.memory_usage.total}</div>
            
        </div>
        <div class="chart-container">
            <canvas id="memoryChart"></canvas>
        </div>
    `;
    return createTile('Memory Usage', memoryContent);
}


function createDiskSpaceUsageTile(data) {
    const diskContent = data.disk_space_usage.map(disk => {
        const usedPercentage = parseInt(disk.used);
        return `
            <div class="info-item">
                <strong>${disk.filesystem}:</strong> ${disk.used} used out of ${disk.size}
                <div class="disk-usage-bar">
                    <div class="disk-usage-fill" style="width: ${usedPercentage}%;"></div>
                </div>
            </div>
        `;
    }).join('');
    return createTile('Disk Space Usage', diskContent);
}

function createThermalTile(data) {
    const thermalContent = data.thermals.map(thermal => `
        <div class="info-item">
            <strong>${thermal.type}:</strong> ${thermal.temp}°C
        </div>
    `).join('');
    return createTile('Thermal Information', thermalContent);
}

function createPhysicalDrivesTile(data) {
    const drivesContent = data.physical_drives.map((drive, index) => `
      <div class="drive-card" id="drive-card-${index}">
        <h3 class="expandable-header"><i class="fas fa-hdd"></i> ${drive.device}</h3>
        <div class="expandable-content">
          <div class="drive-info">
            <div><i class="fas fa-info-circle tooltip"><span class="tooltiptext">Model</span></i> ${drive.model}</div>
            <div><i class="fas fa-database tooltip"><span class="tooltiptext">Size</span></i> ${drive.size}</div>
            <div class="tooltip" onclick="copyToClipboard('${drive.serial}')" style="cursor: pointer;"><i class="fas fa-barcode tooltip"><span class="tooltiptext">Serial</span></i> <span class="truncate">${drive.serial.slice(0, 8)}...</span></div>
            <div><i class="fas fa-exchange-alt tooltip"><span class="tooltiptext">Transport</span></i> ${drive.tran}</div>
            <div><i class="fas fa-thermometer-half tooltip"><span class="tooltiptext">Temperature</span></i> ${drive.temp ? `${drive.temp}°C` : 'N/A'}</div>
            <div><i class="fas fa-heartbeat tooltip"><span class="tooltiptext">Health</span></i> ${drive.health}</div>
            <div><i class="fas fa-clock tooltip"><span class="tooltiptext">Power On Hours</span></i> ${drive.powerOn ? `${drive.powerOn}h` : 'N/A'}</div>
            <div><i class="fas fa-plug tooltip"><span class="tooltiptext">State</span></i> ${drive.state}</div>
          </div>
          ${drive.partitions ? `
            <div class="partitions">
              <strong>Partitions:</strong> ${drive.partitions}
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');
  
    return createTile('Physical Drives', `
      <div class="physical-drives-container">
        ${drivesContent}
      </div>
    `);
}



function setupExpandableContainers() {
    const headers = document.querySelectorAll('.expandable-header');
    headers.forEach((header, index) => {
        header.addEventListener('click', () => {
            header.classList.toggle('expanded');
            const content = header.nextElementSibling;
            if (content) {
                content.classList.toggle('expanded');
            }
        });
    });
}

function copyToClipboard(text) {
    const tempInput = document.createElement('input');
    tempInput.style.position = 'absolute';
    tempInput.style.left = '-9999px';
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    alert(`Copied: ${text}`);
}


function updateDashboard(data) {
    const dashboard = document.getElementById('dashboard');
    dashboard.innerHTML = '';

    if (data.system_info) {
        dashboard.innerHTML += createSystemInfoTile(data);
    }
    if (data.ip_addresses) {
        dashboard.innerHTML += createIPAddressesTile(data);
    }
    if (data.docker) {
        dashboard.innerHTML += createDockerTile(data);
    }
    if (data.memory_usage) {
        dashboard.innerHTML += createMemoryUsageTile(data);
    }
    if (data.disk_space_usage) {
        dashboard.innerHTML += createDiskSpaceUsageTile(data);
    }
    if (data.thermals) {
        dashboard.innerHTML += createThermalTile(data);
    }
    if (data.physical_drives) {
        dashboard.innerHTML += createPhysicalDrivesTile(data);
    }
    if (data.cpu_usage) {
        dashboard.innerHTML += createCPUUsageTile(data);
        setTimeout(() => {
            createCPUChart(data.cpu_usage);
        }, 0);
    }

    setupExpandableContainers();

    if (data.memory_usage && data.memory_usage.applications) {
        setTimeout(() => createMemoryChart(data.memory_usage.applications), 0);
    }
}



async function fetchSystemInfo() {
    try {
        const selectedTiles = JSON.parse(localStorage.getItem('dashboardTiles')) || [
            'systemInfo', 'ipAddresses', 'docker', 'memoryUsage', 'diskSpaceUsage', 'thermal', 'physicalDrives', 'cpuUsage'
        ];
        const response = await fetch(`/api/system-info?tiles=${selectedTiles.join(',')}`);
        const data = await response.json();
        updateDashboard(data);
    } catch (error) {
        console.error('Error fetching system info:', error);
        document.getElementById('dashboard').innerHTML = '<p>Error fetching system information. Please try again later.</p>';
    }
}


const chartColors = [
    'rgb(255, 99, 132)',
    'rgb(54, 162, 235)',
    'rgb(255, 205, 86)',
    'rgb(75, 192, 192)',
    'rgb(153, 102, 255)',
    'rgb(255, 159, 64)',
    'rgb(199, 199, 199)',
    'rgb(83, 102, 255)',
    'rgb(40, 159, 64)',
    'rgb(210, 199, 199)'
];


function createMemoryChart(memoryData) {
    const ctx = document.getElementById('memoryChart');
    
    if (!ctx) {
        console.error('Memory chart canvas not found');
        return;
    }

    if (memoryChart) {
        memoryChart.destroy();
    }

    const totalMemoryUsage = memoryData.reduce((sum, app) => sum + app.memoryUsage, 0);

    const data = {
        labels: memoryData.map(app => app.name),
        datasets: [{
            data: memoryData.map(app => app.memoryUsage),
            backgroundColor: chartColors,
            hoverOffset: 4
        }]
    };

    const config = {
        type: 'pie',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // Hide legend labels
                },
                title: {
                    display: true,
                    text: 'Memory Usage by Application',
                    color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const percentage = ((value / totalMemoryUsage) * 100).toFixed(2);
                            return `${label}: ${formatBytes(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    };

    try {
        memoryChart = new Chart(ctx, config);
    } catch (error) {
        console.error('Error creating chart:', error);
    }
}



function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function controlContainer(action, containerName) {
    try {
        const response = await fetch(`/api/docker/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ containerName }),
        });
        const result = await response.json();
        if (result.success) {
            alert(`${action} operation successful for ${containerName}`);
            fetchSystemInfo(); // Refresh the dashboard
        } else {
            alert(`Error: ${result.error}`);
        }
    } catch (error) {
        console.error(`Error ${action}ing container:`, error);
        alert(`Failed to ${action} container ${containerName}`);
    }
}

function setupExpandableContainers() {
    const headers = document.querySelectorAll('.expandable-header');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            header.classList.toggle('expanded');
            header.nextElementSibling.classList.toggle('expanded');
        });
    });
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / (3600*24));
    const hours = Math.floor(seconds % (3600*24) / 3600);
    return `${days}d ${hours}h`;
}

function openSettingsModal() {
    document.getElementById('settingsModal').style.display = 'block';
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

function saveSettings(event) {
    event.preventDefault();
    const form = event.target;
    const selectedTiles = Array.from(form.elements)
        .filter(el => el.type === 'checkbox' && el.checked)
        .map(el => el.name);
    
    localStorage.setItem('dashboardTiles', JSON.stringify(selectedTiles));
    closeSettingsModal();
    fetchSystemInfo();
}

function initializeSettingsForm() {
    const savedTiles = JSON.parse(localStorage.getItem('dashboardTiles')) || [
        'systemInfo', 'ipAddresses', 'docker', 'memoryUsage', 'diskSpaceUsage', 'thermal', 'physicalDrives', 'cpuUsage'
    ];
    const form = document.getElementById('settingsForm');
    
    Array.from(form.elements)
        .filter(el => el.type === 'checkbox')
        .forEach(el => {
            el.checked = savedTiles.includes(el.name);
        });
}



function updateChartColors(chart) {
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim();

    if (chart.options && chart.options.plugins) {
        if (chart.options.plugins.legend && chart.options.plugins.legend.labels) {
            chart.options.plugins.legend.labels.color = textColor;
        }
        if (chart.options.plugins.title) {
            chart.options.plugins.title.color = textColor;
        }
    }
    
    // We're not changing the dataset colors here anymore
    // The pie segments will keep their original colors

    chart.update();
}


function setThemeVariables(isDarkMode) {
    const root = document.documentElement;
    const variables = isDarkMode ? darkModeVars : lightModeVars;
    
    Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
}

function initializeDarkMode() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const body = document.body;
    const isDarkMode = localStorage.getItem('darkMode') === 'true';

    function setDarkMode(isDark) {
        document.body.classList.toggle('dark-mode', isDark);
        document.getElementById('darkModeToggle').innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        localStorage.setItem('darkMode', isDark);
        
        setThemeVariables(isDark);
    
        // Update chart colors
        if (memoryChart) {
            updateChartColors(memoryChart);
        }
    }

    // Set initial state
    setDarkMode(isDarkMode);

    // Toggle dark mode on button click
    darkModeToggle.addEventListener('click', () => {
        const isDarkModeNow = !body.classList.contains('dark-mode');
        setDarkMode(isDarkModeNow);
    });
}

function createCPUUsageTile(data) {
    const totalCPUUsage = data.cpu_usage.reduce((sum, app) => sum + app.cpuUsage, 0).toFixed(2);

    const cpuUsageContent = `
        <div class="info-item">
            <div class="memory-usage-bar">
                <div class="memory-usage-segment memory-usage-used" style="width: ${totalCPUUsage}%;"></div>
                <div class="memory-usage-segment memory-usage-free" style="width: ${100 - totalCPUUsage}%;"></div>
            </div>
            <div><strong>Total CPU Usage:</strong> ${totalCPUUsage}%</div>
        </div>
        <div class="chart-container">
            <canvas id="cpuChart"></canvas>
        </div>
    `;
    return createTile('CPU Usage', cpuUsageContent);
}


function createTotalCPUChart(cpuData) {
    const ctx = document.getElementById('totalCPUChart');
    
    if (!ctx) {
        console.error('Total CPU chart canvas not found');
        return;
    }

    if (window.totalCPUChart instanceof Chart) {
        window.totalCPUChart.destroy();
    }

    const totalCPUUsage = cpuData.reduce((sum, app) => sum + app.cpuUsage, 0);

    const data = {
        labels: ['Total CPU Usage'],
        datasets: [{
            data: [totalCPUUsage],
            backgroundColor: chartColors[0],
            hoverOffset: 4
        }]
    };

    const config = {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(),
                        callback: function(value) { return value + "%"; }
                    },
                    title: {
                        display: true,
                        text: 'Percentage',
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
                    }
                },
                x: {
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(),
                    },
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Total CPU Usage',
                    color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
                }
            }
        }
    };

    try {
        window.totalCPUChart = new Chart(ctx, config);
    } catch (error) {
        console.error('Error creating total CPU chart:', error);
    }
}


function createCPUChart(cpuData) {
    const ctx = document.getElementById('cpuChart');
    
    if (!ctx) {
        console.error('CPU chart canvas not found');
        return;
    }

    if (window.cpuChart instanceof Chart) {
        window.cpuChart.destroy();
    }

    const data = {
        labels: cpuData.map(app => app.name),
        datasets: [{
            data: cpuData.map(app => app.cpuUsage),
            backgroundColor: chartColors,
            hoverOffset: 4
        }]
    };

    const config = {
        type: 'pie',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // Hide legend labels
                },
                title: {
                    display: true,
                    text: 'CPU Usage by Application',
                    color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const percentage = value.toFixed(2);
                            return `${label}: ${percentage}%`;
                        }
                    }
                }
            }
        }
    };

    try {
        window.cpuChart = new Chart(ctx, config);
    } catch (error) {
        console.error('Error creating chart:', error);
    }
}






// Make sure to call this function when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeSettingsForm();
    initializeDarkMode();
    fetchSystemInfo();
});

document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);

document.getElementById('settingsForm').addEventListener('submit', saveSettings);

window.addEventListener('click', (event) => {
    if (event.target === document.getElementById('settingsModal')) {
        closeSettingsModal();
    }
});

// Fetch system info every 60 seconds
setInterval(fetchSystemInfo, 60000);
