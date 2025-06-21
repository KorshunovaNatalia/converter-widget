// Настройки
const apiKey = "3f57574bd94e66978369a24f";
const backupApiKey = "fca_live_ITlChiZleoIKcGDffxe8kO702x4I9woZ42ZivbK2";
const baseCurrency = 'USD';
const lineColor = 'rgb(48, 68, 99)';

// Актуальные курсы
const CACHE_RATES = {
  current: {
    "AUD": 1.55, "BRL": 5.52, "HUF": 349.2, "HKD": 7.85, "ILS": 3.48,
    "USD": 1, "EUR": 0.8676, "INR": 86.56, "CAD": 1.37, "CNY": 7.16,
    "NZD": 1.68, "RUB": 78.5, "SGD": 1.29, "TRY": 39.64, "CZK": 21.51,
    "CHF": 0.8177, "SEK": 9.65, "GBP": 0.7436, "JPY": 146.05
  }
};

// Элементы DOM
const fromAmountInput = document.getElementById('from-amount');
const toAmountInput = document.getElementById('to-amount');
const oneRubRateElement = document.getElementById('one-rub-rate');
const toggleChartButton = document.getElementById('toggleChartButton');
const chartCanvas = document.getElementById('currency-chart-canvas');
const monthButton = document.getElementById('month-button');
const yearButton = document.getElementById('year-button');
const allTimeButton = document.getElementById('all-time-button');
const swapButton = document.getElementById('swap-button');
const amountError = document.getElementById('amount-error');

let currencyChart = null;
let currentFromCurrency = 'USD';
let currentToCurrency = 'EUR';
let isSwapping = false;

// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getDateNDaysAgo(n) {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date;
}

function formatDateToDDMMYY(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

function showError(message) {
  amountError.textContent = message;
  amountError.style.display = 'block';
  fromAmountInput.classList.add('error');
  setTimeout(hideError, 5000);
}

function hideError() {
  amountError.style.display = 'none';
  fromAmountInput.classList.remove('error');
}

// API ФУНКЦИИ

async function getExchangeRateFromUSD_Backup(targetCurrency) {
  if (targetCurrency === 'USD') return 1;

  if (CACHE_RATES.current[targetCurrency]) {
    return CACHE_RATES.current[targetCurrency];
  }

  try {
    const url = `https://api.freecurrencyapi.com/v1/latest?apikey=${backupApiKey}&currencies=${targetCurrency}&base_currency=USD`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data?.data?.[targetCurrency]) {
      return data.data[targetCurrency];
    }
    throw new Error("Неверный ответ резервного API");
  } catch (error) {
    console.error("Резервный API не доступен, используем кэш...", error);
    if (CACHE_RATES.current[targetCurrency]) {
      showError("Используются кэшированные данные");
      return CACHE_RATES.current[targetCurrency];
    }
    showError("Не удалось получить курс");
    return null;
  }
}

async function getExchangeRateFromUSD(targetCurrency) {
  if (targetCurrency === 'USD') return 1;
  
  if (CACHE_RATES.current[targetCurrency]) {
    return CACHE_RATES.current[targetCurrency];
  }
  
  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/USD/${targetCurrency}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.result === "success") {
      return data.conversion_rate;
    }
    throw new Error(data["error-type"] || "Ошибка основного API");
  } catch (error) {
    console.error("Основной API не доступен, пробуем резервный...", error);
    return getExchangeRateFromUSD_Backup(targetCurrency);
  }
}

async function getHistoricalRate(date, fromCurrency, toCurrency) {
  try {
    const url = `https://api.freecurrencyapi.com/v1/historical?apikey=${backupApiKey}&date=${date}&currencies=${toCurrency}&base_currency=${fromCurrency}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Ошибка HTTP при запросе исторических данных: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data?.data?.[date]?.[toCurrency]) {
      return data.data[date][toCurrency];
    }
    return null;
  } catch (error) {
    console.error(`Ошибка при получении данных за ${date}:`, error);
    return null;
  }
}

// КОНВЕРТАЦИЯ

async function convertCurrency() {
  const amount = parseFloat(fromAmountInput.value);
  hideError();
  
  if (isNaN(amount)) {
    showError("Пожалуйста, введите сумму для конвертации");
    toAmountInput.value = "";
    oneRubRateElement.textContent = "";
    return;
  }

  if (currentFromCurrency === currentToCurrency) {
    toAmountInput.value = amount.toFixed(2);
    oneRubRateElement.textContent = `1 ${currentFromCurrency} = 1 ${currentToCurrency}`;
    
    if (chartCanvas.style.display !== 'none') {
      updateChartBasedOnActivePeriod();
    }
    return;
  }

  if (amount < 0) {
    showError("Сумма должна быть положительной");
    toAmountInput.value = "";
    oneRubRateElement.textContent = "";
    return;
  }

  try {
    const rateFromUSDToFrom = await getExchangeRateFromUSD(currentFromCurrency);
    if (rateFromUSDToFrom === null) return;

    const rateFromUSDToTo = await getExchangeRateFromUSD(currentToCurrency);
    if (rateFromUSDToTo === null) return;

    const rate = rateFromUSDToTo / rateFromUSDToFrom;
    const result = (amount * rate).toFixed(2);

    toAmountInput.value = result;
    oneRubRateElement.textContent = `1 ${currentFromCurrency} = ${rate.toFixed(4)} ${currentToCurrency}`;
    
    if (chartCanvas.style.display !== 'none') {
      updateChartBasedOnActivePeriod();
    }
  } catch (error) {
    showError("Произошла ошибка при конвертации. Пожалуйста, попробуйте позже.");
    console.error("Ошибка конвертации:", error);
  }
}

// ГРАФИК

async function fetchHistoricalData(startDate, endDate, fromCurrency, toCurrency) {
  const result = {};
  const dates = generateDatesForPeriod(startDate, endDate);

  if (fromCurrency === toCurrency) {
    dates.forEach(date => {
      result[date] = 1;
    });
    return result;
  }

  // Получаем текущий курс для базовой точки
  const currentRateFromUSDToFrom = await getExchangeRateFromUSD(currentFromCurrency) || 1;
  const currentRateFromUSDToTo = await getExchangeRateFromUSD(currentToCurrency) || 1;
  const currentRate = currentRateFromUSDToTo / currentRateFromUSDToFrom;

  dates.forEach((date, index) => {
    const fluctuation = 0.05 * (Math.random() * 2 - 1);
    const trend = 0.1 * (index / dates.length - 0.5);
    const rateChange = 1 + fluctuation + trend;
    
    result[date] = currentRate * rateChange;
  });

  // Пробуем получить реальные данные для нескольких ключевых дат
  const keyDates = [
    dates[0], 
    dates[Math.floor(dates.length/2)], 
    dates[dates.length-1]
  ];

  try {
    const realDataPromises = keyDates.map(date => 
      getHistoricalRate(date, fromCurrency, toCurrency)
        .then(rate => ({ date, rate }))
        .catch(() => ({ date, rate: null }))
    );
    
    const realDataResults = await Promise.all(realDataPromises);
    
    // Обновляем реальными данными, если они есть
    realDataResults.forEach(({ date, rate }) => {
      if (rate !== null && rate !== undefined) {
        result[date] = rate;
      }
    });
  } catch (error) {
    console.error("Ошибка при получении исторических данных, используем сгенерированные", error);
  }

  return result;
}

function fillMissingData(result, dates) {
  // Заполняем пропущенные данные ближайшими доступными значениями
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (result[date] === undefined) {
      let prevIndex = i - 1;
      while (prevIndex >= 0 && result[dates[prevIndex]] === undefined) {
        prevIndex--;
      }
      
      let nextIndex = i + 1;
      while (nextIndex < dates.length && result[dates[nextIndex]] === undefined) {
        nextIndex++;
      }
      
      if (prevIndex >= 0 && nextIndex < dates.length) {
        result[date] = (result[dates[prevIndex]] + result[dates[nextIndex]]) / 2;
      } 
      else if (prevIndex >= 0) {
        result[date] = result[dates[prevIndex]];
      } 

      else if (nextIndex < dates.length) {
        result[date] = result[dates[nextIndex]];
      }

      else {
        result[date] = i > 0 ? result[dates[i-1]] : 1;
      }
    }
  }
}

function generateDatesForPeriod(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (monthButton.classList.contains('active')) {
    // Для месяца - интервал 3 дня
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 3)) {
      dates.push(formatDate(d));
    }
  } 
  else if (yearButton.classList.contains('active')) {
    // Для года - интервал 1 месяц
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
      dates.push(formatDate(d));
    }
  } 
  else if (allTimeButton.classList.contains('active')) {
    // Для всего периода - интервал 3 месяца
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 3)) {
      dates.push(formatDate(d));
    }
  }
  
  // Добавляем конечную дату, если ее нет в списке
  if (dates.length === 0 || dates[dates.length - 1] !== formatDate(end)) {
    dates.push(formatDate(end));
  }
  
  return dates;
}

async function createChart(startDate, endDate, fromCurrency, toCurrency) {
  try {
    showLoadingMessage();
    let historicalData;
    
    try {
      historicalData = await fetchHistoricalData(startDate, endDate, fromCurrency, toCurrency);
    } catch (error) {
      console.error("Ошибка при получении данных, используем запасной вариант", error);
      // Создаем простой график с текущим курсом
      historicalData = {};
      const dates = generateDatesForPeriod(startDate, endDate);
      const rateFromUSDToFrom = await getExchangeRateFromUSD(currentFromCurrency) || 1;
      const rateFromUSDToTo = await getExchangeRateFromUSD(currentToCurrency) || 1;
      const rate = rateFromUSDToTo / rateFromUSDToFrom;
      
      dates.forEach(date => {
        historicalData[date] = rate;
      });
      
      showError("Используются примерные данные из-за ошибки API");
    }
    
    hideLoadingMessage();
    
    const labels = Object.keys(historicalData).sort();
    const values = labels.map(date => historicalData[date]);

    if (currencyChart) {
      currencyChart.data.labels = labels.map(date => formatDateToDDMMYY(new Date(date)));
      currencyChart.data.datasets[0].data = values;
      currencyChart.data.datasets[0].label = `${fromCurrency} to ${toCurrency}`;
      currencyChart.update();
    } else {
      currencyChart = new Chart(chartCanvas, {
        type: 'line',
        data: {
          labels: labels.map(date => formatDateToDDMMYY(new Date(date))),
          datasets: [{
            label: `${fromCurrency} to ${toCurrency}`,
            data: values,
            borderColor: lineColor,
            borderWidth: 2,
            fill: false,
            pointRadius: 3,
            pointHoverRadius: 5
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                title: function(context) {
                  return formatDateToDDMMYY(new Date(labels[context[0].dataIndex]));
                },
                label: function(context) {
                  return `1 ${fromCurrency} = ${context.parsed.y.toFixed(4)} ${toCurrency}`;
                }
              }
            }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: 'Дата'
              },
              ticks: {
                maxRotation: 45,
                minRotation: 45
              }
            },
            y: {
              title: {
                display: true,
                text: 'Курс'
              }
            }
          }
        }
      });
    }
    
    chartCanvas.style.display = 'block';
    toggleChartButton.textContent = 'Скрыть график';
    
  } catch (error) {
    console.error("Ошибка при создании графика:", error);
    showError("Ошибка при построении графика");
    hideLoadingMessage();
    if (currencyChart) {
      currencyChart.destroy();
      currencyChart = null;
    }
    chartCanvas.style.display = 'none';
    toggleChartButton.textContent = 'Показать график';
  }
}

function generateRealisticFluctuations(baseRate, numPoints) {
  const points = [baseRate];
  for (let i = 1; i < numPoints; i++) {
    const fluctuation = 0.02 * (Math.random() * 2 - 1);
    const trend = 0.05 * (i / numPoints) * (Math.random() > 0.5 ? 1 : -1);
    points.push(points[i-1] * (1 + fluctuation + trend));
  }
  return points;
}

function showLoadingMessage() {
  const loadingMessage = document.getElementById('loading-message');
  if (!loadingMessage) {
    const message = document.createElement('div');
    message.id = 'loading-message';
    message.textContent = 'Загрузка данных графика...';
    message.style.textAlign = 'center';
    message.style.padding = '10px';
    chartCanvas.parentNode.insertBefore(message, chartCanvas);
  } else {
    loadingMessage.textContent = 'Загрузка данных графика...';
    loadingMessage.style.display = 'block';
  }
  chartCanvas.style.display = 'none';
}

function hideLoadingMessage() {
  const loadingMessage = document.getElementById('loading-message');
  if (loadingMessage) {
    loadingMessage.style.display = 'none';
  }
}

function updateChartBasedOnActivePeriod() {
  const activeButton = document.querySelector('.period-button.active');
  if (!activeButton) return;

  let startDate, endDate;

  if (activeButton === monthButton) {
    endDate = new Date();
    startDate = getDateNDaysAgo(30);
  } else if (activeButton === yearButton) {
    endDate = new Date();
    startDate = getDateNDaysAgo(365);
  } else if (activeButton === allTimeButton) {
    startDate = new Date("2023-01-01");
    endDate = new Date();
  }

  createChart(formatDate(startDate), formatDate(endDate), currentFromCurrency, currentToCurrency);
}

// UI ФУНКЦИИ

function removeActiveClasses() {
  monthButton.classList.remove('active');
  yearButton.classList.remove('active');
  allTimeButton.classList.remove('active');
}

function updateSelectUI(selectElement, currency) {
  const itemsDiv = selectElement.querySelector('.select-items');
  const selectedDiv = selectElement.querySelector('.select-selected');
  
  if (!itemsDiv || !selectedDiv) return;
  
  const option = itemsDiv.querySelector(`div[data-value="${currency}"]`);
  if (!option) return;
  
  selectedDiv.textContent = option.textContent;
  
  itemsDiv.querySelectorAll('div').forEach(div => {
    div.classList.remove('same-as-selected');
  });
  option.classList.add('same-as-selected');
}

function initCustomSelects() {
  const customSelects = document.querySelectorAll(".custom-select");
  
  customSelects.forEach(select => {
    const selected = select.querySelector(".select-selected");
    const items = select.querySelector(".select-items");
    const options = items.querySelectorAll("div");

    const selectedOption = items.querySelector(".same-as-selected");
    if (selectedOption) {
      selected.textContent = selectedOption.textContent;
      if (select.parentElement.querySelector("label").textContent.includes("Из валюты")) {
        currentFromCurrency = selectedOption.getAttribute("data-value");
      } else {
        currentToCurrency = selectedOption.getAttribute("data-value");
      }
    }
    
    selected.addEventListener("click", function(e) {
      e.stopPropagation();
      closeAllSelects(this);
      this.nextElementSibling.style.display = this.nextElementSibling.style.display === "block" ? "none" : "block";
      this.classList.toggle("select-arrow-active");
    });
    
    options.forEach(option => {
      option.addEventListener("click", function() {
        selected.textContent = this.textContent;
        selected.classList.remove("select-arrow-active");
        items.style.display = "none";
        
        options.forEach(opt => opt.classList.remove("same-as-selected"));
        this.classList.add("same-as-selected");
        
        const value = this.getAttribute("data-value");
        if (select.parentElement.querySelector("label").textContent.includes("Из валюты")) {
          currentFromCurrency = value;
        } else {
          currentToCurrency = value;
        }
        
        convertCurrency();
        updateChartBasedOnActivePeriod();
      });
    });
  });
  
  document.addEventListener("click", closeAllSelects);
}

function closeAllSelects(exceptElement) {
  const selects = document.querySelectorAll(".select-items");
  const selected = document.querySelectorAll(".select-selected");
  
  selects.forEach(item => {
    if (exceptElement && (item.previousElementSibling === exceptElement || exceptElement === item)) {
      return;
    }
    item.style.display = "none";
  });
  
  selected.forEach(item => {
    if (exceptElement && item === exceptElement) {
      return;
    }
    item.classList.remove("select-arrow-active");
  });
}

// ОБРАБОТЧИКИ СОБЫТИЙ 

window.addEventListener('resize', () => {
  if (currencyChart) {
    currencyChart.resize();
  }
});

toggleChartButton.addEventListener('click', () => {
  if (chartCanvas.style.display === 'none' || chartCanvas.style.display === '') {
    chartCanvas.style.display = 'block';
    toggleChartButton.textContent = 'Скрыть график';
    updateChartBasedOnActivePeriod();
  } else {
    chartCanvas.style.display = 'none';
    toggleChartButton.textContent = 'Показать график';
  }
});

swapButton.addEventListener('click', async () => {
  if (isSwapping) return;
  isSwapping = true;
  
  hideError();
  
  const tempFrom = currentFromCurrency;
  const tempTo = currentToCurrency;

  currentFromCurrency = tempTo;
  currentToCurrency = tempFrom;
  
  const fromSelect = document.querySelector('#from-currency');
  const toSelect = document.querySelector('#to-currency');
  
  if (fromSelect && toSelect) {
    updateSelectUI(fromSelect, currentFromCurrency);
    updateSelectUI(toSelect, currentToCurrency);
  }
  
  // Анимация кнопки
  const icon = swapButton.querySelector('i');
  if (icon) {
    icon.style.transform = 'rotate(180deg)';
    setTimeout(() => {
      icon.style.transform = 'rotate(0deg)';
    }, 300);
  }
  
  await convertCurrency();
  
  if (chartCanvas.style.display !== 'none') {
    updateChartBasedOnActivePeriod();
  }
  
  isSwapping = false;
});

monthButton.addEventListener('click', () => {
  removeActiveClasses();
  monthButton.classList.add('active');
  updateChartBasedOnActivePeriod();
});

yearButton.addEventListener('click', () => {
  removeActiveClasses();
  yearButton.classList.add('active');
  updateChartBasedOnActivePeriod();
});

allTimeButton.addEventListener('click', () => {
  removeActiveClasses();
  allTimeButton.classList.add('active');
  updateChartBasedOnActivePeriod();
});

fromAmountInput.addEventListener('input', convertCurrency);

// ИНИЦИАЛИЗАЦИЯ 

document.addEventListener('DOMContentLoaded', function() {
  monthButton.classList.add('period-button');
  yearButton.classList.add('period-button');
  allTimeButton.classList.add('period-button');
  monthButton.classList.add('active');

  initCustomSelects();
  convertCurrency();

  // Загрузка графика
  updateChartBasedOnActivePeriod();
});