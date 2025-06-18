// === Элементы DOM ===
const fromAmountInput = document.getElementById('from-amount');
const fromCurrencySelect = document.getElementById('from-currency');
const toAmountInput = document.getElementById('to-amount');
const toCurrencySelect = document.getElementById('to-currency');
const oneRubRateElement = document.getElementById('one-rub-rate');
const toggleChartButton = document.getElementById('toggleChartButton');
const chartCanvas = document.getElementById('currency-chart-canvas');
const monthButton = document.getElementById('month-button');
const yearButton = document.getElementById('year-button');
const allTimeButton = document.getElementById('all-time-button');
const swapButton = document.getElementById('swap-button');
const amountError = document.getElementById('amount-error');

let currencyChart  = null; // Переменная для хранения графика

// === Настройки ===

const apiKey = "fca_live_ITlChiZleoIKcGDffxe8kO702x4I9woZ42ZivbK2"; //API-ключ
const baseCurrency = 'USD'; // Базовая валюта
const lineColor = 'rgb(48, 68, 99)'; // Цвет линии графика


// === Функции ===

// Функция для удаления класса "active" со всех кнопок
function removeActiveClasses() {
    monthButton.classList.remove('active');
    yearButton.classList.remove('active');
    allTimeButton.classList.remove('active');
}

function showError(message) {
    amountError.textContent = message;
    amountError.style.display = 'block';
    fromAmountInput.classList.add('error');
}

function hideError() {
    amountError.style.display = 'none';
    fromAmountInput.classList.remove('error');
}


// Функция для получения курса валюты
async function getExchangeRateFromUSD(targetCurrency) {
    try {
        const response = await fetch(`https://api.freecurrencyapi.com/v1/latest?apikey=${apiKey}&currencies=${targetCurrency}&base_currency=${baseCurrency}`);
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }

        const data = await response.json();
        if (data.data && data.data[targetCurrency]) {
            return data.data[targetCurrency];
        }
        else {
            console.error("Не удалось получить курс для", targetCurrency);
            return null;
        }
    } 
    catch (error) {
        console.error("Ошибка при получении курса:", error);
        return null;
    }
}

// Функция для конвертации валюты
async function convertCurrency() {
    const amount = parseFloat(fromAmountInput.value);
    hideError();
    
    // Проверка на пустое поле или нечисловое значение
    if (isNaN(amount) || fromAmountInput.value.trim() === '') {
        showError("Пожалуйста, введите сумму для конвертации");
        toAmountInput.value = "";
        oneRubRateElement.textContent = "";
        return;
    }
    
    // Проверка на отрицательное значение
    if (amount < 0) {
        showError("Сумма должна быть положительной");
        toAmountInput.value = "";
        oneRubRateElement.textContent = "";
        return;
    }

    const fromCurrency = fromCurrencySelect.value;
    const toCurrency = toCurrencySelect.value;
    let rate;

    try {
        const rateFromUSDToFrom = await getExchangeRateFromUSD(fromCurrency);
        if (rateFromUSDToFrom === null) {
            showError("Не удалось получить курс для исходной валюты");
            toAmountInput.value = "";
            oneRubRateElement.textContent = "";
            return;
        }

        const rateFromUSDToTo = await getExchangeRateFromUSD(toCurrency);
        if (rateFromUSDToTo === null) {
            showError("Не удалось получить курс для целевой валюты");
            toAmountInput.value = "";
            oneRubRateElement.textContent = "";
            return;
        }

        rate = rateFromUSDToTo / rateFromUSDToFrom;
        const result = (amount * rate).toFixed(2);
        toAmountInput.value = result;
        oneRubRateElement.textContent = `1 ${fromCurrency} = ${(rate).toFixed(4)} ${toCurrency}`;
    } 
    catch (error) {
        showError("Произошла ошибка при конвертации. Пожалуйста, попробуйте позже.");
        console.error("Ошибка конвертации:", error);
    }
}

// Функция для получения исторических данных
async function getHistoricalData(startDate, endDate, fromCurrency, toCurrency, period) {
    try {
        const historicalRates = {};
        let currentDate = new Date(startDate);
        const endDateObj = new Date(endDate);
        let dataInterval = 7;

        if (period === 'year') {
            dataInterval = 60;
        }
        else if (period === 'all') {
            dataInterval = 365;
        }
        while (currentDate <= endDateObj) {
            const dateString = currentDate.toISOString().split('T')[0];
            const formattedDate = dateString.replace(/-/g, '-');
            const url = `https://api.freecurrencyapi.com/v1/historical?apikey=${apiKey}&date=${formattedDate}&currencies=${toCurrency}&base_currency=${fromCurrency}`;
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`Ошибка HTTP для ${formattedDate}: ${response.status}`);
                currentDate.setDate(currentDate.getDate() + dataInterval);
                continue;
            }

            const data = await response.json();
            if (data.data && data.data[formattedDate] && data.data[formattedDate][toCurrency]) {
                historicalRates[formattedDate] = data.data[formattedDate][toCurrency];
            } 
            else {
                console.error(`Нет данных для ${formattedDate}`);
            }
            currentDate.setDate(currentDate.getDate() + dataInterval);
            if (currentDate > endDateObj) { 
                break;
            }
        }
        return historicalRates;
    } 
    catch (error) {
        console.error("Ошибка при получении исторических данных:", error);
        return null;
    }
}

function getFontSize() {
    const width = window.innerWidth;
    if (width >= 7000) return { size: 44 };
    if (width >= 5000) return { size: 32 };
    if (width >= 3000) return { size: 16 };
    if (width >= 1000) return { size: 14 };
    if (width >= 400) return { size: 12 };
    return { size: 10 };
}


// Функция для построения графика
async function createChart(startDate, endDate, fromCurrency, toCurrency, period) {
    const historicalData = await getHistoricalData(startDate, endDate, fromCurrency, toCurrency, period);

    if (!historicalData) {
        alert("Не удалось загрузить данные для графика.");
        return;
    }

    const labels = Object.keys(historicalData).sort(); 
    const values = labels.map(date => historicalData[date]);

    if (currencyChart) {
        currencyChart.destroy();
    }

    // Создаем график
    currencyChart = new Chart(chartCanvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '',
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
                const date = new Date(context[0].label);
                return formatDateToDDMMYY(date);
                }
            },
            titleFont: getFontSize
            }
        },
        scales: {
            x: {
            title: {
                display: true,
                text: 'Дата',
                font: getFontSize
            },
            ticks: {
                callback: function(value) {
                const date = new Date(this.getLabelForValue(value));
                return formatDateToDDMMYY(date);
                },
                font: getFontSize
            }
            },
            y: {
            title: {
                display: true,
                text: 'Курс',
                font: getFontSize
            },
            ticks: {
                font: getFontSize
            }
            }
        }
        }
    });
    chartCanvas.style.display = 'block';
    toggleChartButton.textContent = 'Скрыть график';
}

// Функция для форматирования даты в ДД.ММ.ГГ
function formatDateToDDMMYY(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
}

// Функция для получения даты N дней назад
function getDateNDaysAgo(n) {
    const today = new Date();
    const pastDate = new Date(today);
    pastDate.setDate(today.getDate() - n);
    return pastDate.toISOString().slice(0, 10);
}

// Функция для обновления графика с заданной датой начала
function updateChart(startDate, endDate, period, clickedButton) {
    const fromCurrency = fromCurrencySelect.value;
    const toCurrency = toCurrencySelect.value;

    removeActiveClasses(); 
    clickedButton.classList.add('active');

    createChart(startDate, endDate, fromCurrency, toCurrency, period);
}

// Функция для управления состоянием стрелки
function setupSelectArrow(selectElement) {
  let isOpen = false;
  
  selectElement.addEventListener('click', () => {
    isOpen = !isOpen;
    updateArrowState();
  });
  
  selectElement.addEventListener('change', () => {
    isOpen = false;
    updateArrowState();
  });
  
  selectElement.addEventListener('blur', () => {
    isOpen = false;
    updateArrowState();
  });
  
  function updateArrowState() {
    const container = selectElement.parentElement;
    if (isOpen) {
      container.classList.add('select-open');
    } else {
      container.classList.remove('select-open');
    }
  }
}

function updateChartBasedOnActivePeriod() {
    const activeButton = document.querySelector('.period-button.active');
    if (!activeButton) return;

    let startDate, endDate, period;

    if (activeButton === monthButton) {
        endDate = new Date().toISOString().split('T')[0];
        startDate = getDateNDaysAgo(30);
        period = 'month';
    } 
    else if (activeButton === yearButton) {
        endDate = new Date().toISOString().split('T')[0];
        startDate = getDateNDaysAgo(365);
        period = 'year';
    } 
    else if (activeButton === allTimeButton) {
        startDate = "2023-01-01";
        endDate = new Date().toISOString().split('T')[0];
        period = 'all';
    }

    if (startDate && endDate && period) {
        updateChart(startDate, endDate, period, activeButton);
    }
}

// === Обработчики событий ===

window.addEventListener('resize', () => {
    // Обновляем шрифты и перерисовываем график
    currencyChart.options.scales.x.title.font = getFontSize();
    currencyChart.options.scales.x.ticks.font = getFontSize();
    currencyChart.options.scales.y.title.font = getFontSize();
    currencyChart.options.scales.y.ticks.font = getFontSize();
    currencyChart.update();
});

// Добавляем обработчик события клика на кнопку
toggleChartButton.addEventListener('click', () => {
    if (chartCanvas.style.display === 'none' || chartCanvas.style.display === '') {
        chartCanvas.style.display = 'block';
        toggleChartButton.textContent = 'Скрыть график';
    } else {
        chartCanvas.style.display = 'none';
        toggleChartButton.textContent = 'Показать график';
    }
});

// Обработчик события для кнопки обмена валют
swapButton.addEventListener('click', () => {
    hideError();
    const fromCurrency = fromCurrencySelect.value;
    const toCurrency = toCurrencySelect.value;
    fromCurrencySelect.value = toCurrency;
    toCurrencySelect.value = fromCurrency;
    convertCurrency();
});

// Обработчики для кнопок выбора периода
monthButton.addEventListener('click', () => {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = getDateNDaysAgo(30);
    updateChart(startDate, endDate, 'month', monthButton);
});

yearButton.addEventListener('click', () => {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = getDateNDaysAgo(365);
    updateChart(startDate, endDate, 'year', yearButton);
});

allTimeButton.addEventListener('click', () => {
    const startDate = "2023-01-01"; 
    const endDate = new Date().toISOString().split('T')[0];
    updateChart(startDate, endDate, 'all', allTimeButton);
});

setupSelectArrow(fromCurrencySelect);
setupSelectArrow(toCurrencySelect);

// Конвертация валюты при изменении суммы или валюты
fromAmountInput.addEventListener('input', convertCurrency);
fromCurrencySelect.addEventListener('change', () => {
    convertCurrency();
    updateChartBasedOnActivePeriod();
});
toCurrencySelect.addEventListener('change', () => {
    convertCurrency();
    updateChartBasedOnActivePeriod();
});


// === Инициализация ===
// Добавляем класс period-button ко всем кнопкам
monthButton.classList.add('period-button');
yearButton.classList.add('period-button');
allTimeButton.classList.add('period-button');

convertCurrency();

const today = new Date().toISOString().split('T')[0];
const thirtyDaysAgo = getDateNDaysAgo(30);
updateChart(thirtyDaysAgo, today, 'month', monthButton);