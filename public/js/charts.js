// ==============================================================
// METRICS & CHARTS CONTROLLER (Chart.js)
// ==============================================================

let chartAspirantes = null;
let chartHoras = null;
let chartTemasDoughnut = null;

// Configuración de estilo global para Chart.js en modo oscuro glassmorphism
Chart.defaults.color = '#94A3B8';
Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(14, 10, 28, 0.95)';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(139, 92, 246, 0.3)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.titleColor = '#F8FAFC';
Chart.defaults.plugins.tooltip.bodyColor = '#CBD5E1';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;

function initMetricsCharts(metricsData) {
  if (!metricsData) return;

  // 1. Gráfico de Aspirantes y Entrevistas por Día
  const ctxAspirantes = document.getElementById('chartAspirantesDia')?.getContext('2d');
  if (ctxAspirantes) {
    if (chartAspirantes) chartAspirantes.destroy();

    const dias = metricsData.aspirantes_por_dia.map(d => d.dia);
    const aspirantes = metricsData.aspirantes_por_dia.map(d => d.aspirantes);
    const entrevistas = metricsData.aspirantes_por_dia.map(d => d.entrevistas);

    chartAspirantes = new Chart(ctxAspirantes, {
      type: 'bar',
      data: {
        labels: dias,
        datasets: [
          {
            label: 'Aspirantes que escriben',
            data: aspirantes,
            backgroundColor: 'rgba(139, 92, 246, 0.7)',
            borderColor: '#8B5CF6',
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: 'Entrevistas Agendadas',
            data: entrevistas,
            backgroundColor: 'rgba(217, 70, 239, 0.7)',
            borderColor: '#D946EF',
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#E2E8F0', font: { size: 11 } }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            beginAtZero: true
          }
        }
      }
    });
  }

  // 2. Gráfico de Horarios Pico de Consultas
  const ctxHoras = document.getElementById('chartHorasPico')?.getContext('2d');
  if (ctxHoras) {
    if (chartHoras) chartHoras.destroy();

    const horasLabels = metricsData.horas_pico.map(h => h.hora);
    const horasValues = metricsData.horas_pico.map(h => h.consultas);

    chartHoras = new Chart(ctxHoras, {
      type: 'line',
      data: {
        labels: horasLabels,
        datasets: [
          {
            label: 'Nivel de Consultas',
            data: horasValues,
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139, 92, 246, 0.15)',
            borderWidth: 2.5,
            pointBackgroundColor: '#D946EF',
            pointBorderColor: '#fff',
            pointRadius: 4,
            tension: 0.35,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            beginAtZero: true
          }
        }
      }
    });
  }

  // 3. Gráfico de Distribución de Temas
  const ctxTemas = document.getElementById('chartTemas')?.getContext('2d');
  if (ctxTemas) {
    if (chartTemasDoughnut) chartTemasDoughnut.destroy();

    const temasLabels = (metricsData.top_intereses || []).map(t => t.tema);
    const temasValues = (metricsData.top_intereses || []).map(t => t.porcentaje);
    const totalIntereses = temasValues.reduce((a, b) => a + b, 0);
    const hasData = totalIntereses > 0;

    chartTemasDoughnut = new Chart(ctxTemas, {
      type: 'doughnut',
      data: {
        labels: hasData ? temasLabels : ['En espera de consultas iniciales'],
        datasets: [
          {
            data: hasData ? temasValues : [1],
            backgroundColor: hasData ? [
              '#8B5CF6',
              '#D946EF',
              '#10B981',
              '#06B6D4',
              '#F59E0B'
            ] : ['rgba(255, 255, 255, 0.08)'],
            borderWidth: 2,
            borderColor: '#0e0a1f'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#CBD5E1', font: { size: 11 }, boxWidth: 12 }
          }
        },
        cutout: '65%'
      }
    });
  }
}
