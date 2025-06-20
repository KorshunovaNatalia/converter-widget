// Настройки
const apiKey = "fca_live_ITlChiZleoIKcGDffxe8kO702x4I9woZ42ZivbK2";
const baseCurrency = 'USD';
const lineColor = 'rgb(48, 68, 99)';

// Константы
const CACHE_VERSION = 'v2';
const CACHE_EXPIRY_DAYS = 5;
const CACHE_EXPIRY_MS = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const RATE_LIMIT_DELAY = 1000;
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY = 100;

// Поддерживаемые валюты
const supportedCurrencies = ['AUD', 'BRL', 'HUF', 'HKD', 'ILS',
                           'USD', 'EUR', 'INR', 'CAD', 'CNY',
                           'NZD', 'RUB', 'SGD', 'TRY', 'CZK',
                           'CHF', 'SEK', 'GBP', 'JPY'];

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

// ==================== КЛАСС КЭШИРОВАНИЯ ====================
class CurrencyCache {
    static getCacheKey(type, ...params) {
        return `${CACHE_VERSION}_fx_${type}_${params.join('_')}`;
    }

    static async get(cacheKey) {
        try {
            const cached = localStorage.getItem(cacheKey);
            if (!cached) return null;
            
            const parsed = JSON.parse(cached);
            if (!parsed || !parsed.data || !parsed.timestamp) {
                localStorage.removeItem(cacheKey);
                return null;
            }
            
            if (Date.now() - parsed.timestamp > CACHE_EXPIRY_MS) {
                localStorage.removeItem(cacheKey);
                return null;
            }
            
            return parsed.data;
        } catch (e) {
            console.error("Cache read error:", e);
            localStorage.removeItem(cacheKey);
            return null;
        }
    }

    static async set(cacheKey, data) {
        try {
            const cacheItem = {
                data,
                timestamp: Date.now(),
                version: CACHE_VERSION
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheItem));
        } catch (e) {
            console.error("Cache write error:", e);
            if (e.name === 'QuotaExceededError') {
                await this.cleanup();
                // Повторяем попытку после очистки
                localStorage.setItem(cacheKey, JSON.stringify({
                    data,
                    timestamp: Date.now(),
                    version: CACHE_VERSION
                }));
            }
        }
    }

    static async cleanup() {
        const now = Date.now();
        let clearedCount = 0;
        
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key.startsWith(`${CACHE_VERSION}_fx_`)) {
                try {
                    const cached = localStorage.getItem(key);
                    if (!cached) {
                        localStorage.removeItem(key);
                        continue;
                    }
                    
                    const { timestamp } = JSON.parse(cached);
                    if (now - timestamp > CACHE_EXPIRY_MS * 2) {
                        localStorage.removeItem(key);
                        clearedCount++;
                    }
                } catch (e) {
                    localStorage.removeItem(key);
                    clearedCount++;
                }
            }
        }
        
        if (clearedCount > 0) {
            console.log(`Cleared ${clearedCount} old cache entries`);
        }
    }
}

// ==================== API СЕРВИС ====================
class CurrencyAPIService {
    static async fetchWithRetry(url, options = {}, retries = MAX_RETRIES, delay = INITIAL_RETRY_DELAY) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            return response;
        } catch (error) {
            if (retries <= 0) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
            return this.fetchWithRetry(url, options, retries - 1, delay * 2);
        }
    }

    static async getExchangeRate(fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return 1;
        
        const cacheKey = CurrencyCache.getCacheKey('rate', fromCurrency, toCurrency);
        const cached = await CurrencyCache.get(cacheKey);
        if (cached !== null) return cached;
        
        const url = `https://api.freecurrencyapi.com/v1/latest?apikey=${apiKey}&currencies=${toCurrency}&base_currency=${fromCurrency}`;
        
        try {
            const response = await this.fetchWithRetry(url);
            const data = await response.json();
            
            if (data.data && data.data[toCurrency]) {
                await CurrencyCache.set(cacheKey, data.data[toCurrency]);
                return data.data[toCurrency];
            }
            
            throw new Error("Invalid API response format");
        } catch (error) {
            console.error(`Failed to get ${fromCurrency}->${toCurrency} rate:`, error);
            throw error;
        }
    }

    static async getHistoricalRate(date, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return 1;
        
        const cacheKey = CurrencyCache.getCacheKey('history', date, fromCurrency, toCurrency);
        const cached = await CurrencyCache.get(cacheKey);
        if (cached !== null) return cached;
        
        const url = `https://api.freecurrencyapi.com/v1/historical?apikey=${apiKey}&date=${date}&currencies=${toCurrency}&base_currency=${fromCurrency}`;
        
        try {
            const response = await this.fetchWithRetry(url);
            const data = await response.json();
            
            if (data.data && data.data[date] && data.data[date][toCurrency]) {
                const rate = data.data[date][toCurrency];
                await CurrencyCache.set(cacheKey, rate);
                return rate;
            }
            
            throw new Error("Invalid historical data format");
        } catch (error) {
            console.error(`Failed to get historical rate for ${date}:`, error);
            throw error;
        }
    }

    static async preCacheEssentialRates() {
        const lastPrecache = await CurrencyCache.get(CurrencyCache.getCacheKey('last_precache'));
        if (lastPrecache && (Date.now() - lastPrecache < CACHE_EXPIRY_MS / 2)) return;
        
        console.log("Starting essential rates pre-caching...");
        
        const essentialCurrencies = ['EUR', 'GBP', 'JPY', 'CNY', 'RUB'];
        
        for (const currency of essentialCurrencies) {
            try {
                await this.getExchangeRate('USD', currency);
                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
            } catch (error) {
                console.error(`Failed to pre-cache USD->${currency}:`, error);
            }
        }
        
        await CurrencyCache.set(CurrencyCache.getCacheKey('last_precache'), Date.now());
        console.log("Essential rates pre-caching completed");
    }
}

// ==================== ОСНОВНЫЕ ФУНКЦИИ ====================

// Инициализация выпадающих списков
function initCustomSelects() {
    const customSelects = document.querySelectorAll(".custom-select");
    
    customSelects.forEach(select => {
        const selected = select.querySelector(".select-selected");
        const items = select.querySelector(".select-items");
        const options = items.querySelectorAll("div");

        // Установка начальных значений
        if (select.id === 'from-currency') {
            const defaultOption = items.querySelector(`div[data-value="${currentFromCurrency}"]`);
            if (defaultOption) {
                selected.textContent = defaultOption.textContent;
                defaultOption.classList.add("same-as-selected");
            }
        } else if (select.id === 'to-currency') {
            const defaultOption = items.querySelector(`div[data-value="${currentToCurrency}"]`);
            if (defaultOption) {
                selected.textContent = defaultOption.textContent;
                defaultOption.classList.add("same-as-selected");
            }
        }
        
        // Обработчики событий
        selected.addEventListener("click", function(e) {
            e.stopPropagation();
            closeAllSelects(this);
            items.style.display = items.style.display === "block" ? "none" : "block";
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
                if (select.id === 'from-currency') {
                    currentFromCurrency = value;
                } else if (select.id === 'to-currency') {
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

// Конвертация валют
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
        return;
    }

    if (amount < 0) {
        showError("Сумма должна быть положительной");
        toAmountInput.value = "";
        oneRubRateElement.textContent = "";
        return;
    }

    try {
        const rate = await CurrencyAPIService.getExchangeRate(currentFromCurrency, currentToCurrency);
        if (rate === null) {
            showError("Не удалось получить курс валют");
            return;
        }

        const result = (amount * rate).toFixed(2);
        toAmountInput.value = result;
        oneRubRateElement.textContent = `1 ${currentFromCurrency} = ${rate.toFixed(4)} ${currentToCurrency}`;
    } catch (error) {
        console.error("Conversion error:", error);
    }

}

// Работа с графиком
async function createChart(startDate, endDate, fromCurrency, toCurrency, period) {
    // Показать индикатор загрузки
    chartCanvas.style.display = 'none';
    const loader = document.createElement('div');
    loader.className = 'chart-loader';
    chartCanvas.parentNode.appendChild(loader);

    try {
        const historicalData = await fetchHistoricalData(startDate, endDate, fromCurrency, toCurrency, period);

        if (!historicalData || Object.keys(historicalData).length < 2) {
            throw new Error("Недостаточно данных для построения графика");
        }

        const labels = Object.keys(historicalData).sort((a, b) => new Date(a) - new Date(b));
        const values = labels.map(date => historicalData[date]);

        if (currencyChart) {
            currencyChart.destroy();
        }

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
                            callback: function(value) {
                                const date = new Date(this.getLabelForValue(value));
                                return formatDateToDDMMYY(date);
                            }
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
        
        chartCanvas.style.display = 'block';
        toggleChartButton.textContent = 'Скрыть график';
    } catch (error) {
        console.error("Chart creation error:", error);
        showError(error.message || "Ошибка при создании графика");
    } finally {
        if (loader.parentNode) {
            loader.remove();
        }
    }
}

async function fetchHistoricalData(startDate, endDate, fromCurrency, toCurrency, period) {
    const historicalRates = {};
    let currentDate = new Date(startDate);
    const endDateObj = new Date(endDate);
    const today = new Date();
    
    // Проверка на будущие даты
    if (currentDate > today) {
        console.error("Requested future dates");
        return historicalRates;
    }

    // Определяем интервал в зависимости от периода
    let dataInterval = 7; // По умолчанию - неделя
    if (period === 'year') dataInterval = 30; // Месяц
    else if (period === 'all') dataInterval = 90; // Квартал

    const cachedDates = [];
    const requestedDates = [];
    let hasConnectionError = false;

    while (currentDate <= endDateObj && currentDate <= today && !hasConnectionError) {
        const dateString = currentDate.toISOString().split('T')[0];
        const cacheKey = CurrencyCache.getCacheKey('history', dateString, fromCurrency, toCurrency);
        
        // Пытаемся получить данные из кэша
        const cachedRate = await CurrencyCache.get(cacheKey);
        
        if (cachedRate !== null) {
            historicalRates[dateString] = cachedRate;
            cachedDates.push(dateString);
            console.log(`[Cache] Using cached data for ${dateString}: ${fromCurrency}->${toCurrency} = ${cachedRate}`);
        } else {
            // Если нет в кэше и дата не в будущем, запрашиваем с API
            if (currentDate <= today) {
                try {
                    const rate = await CurrencyAPIService.getHistoricalRate(dateString, fromCurrency, toCurrency);
                    if (rate !== null) {
                        historicalRates[dateString] = rate;
                        requestedDates.push(dateString);
                        console.log(`[API] Fetched data for ${dateString}: ${fromCurrency}->${toCurrency} = ${rate}`);
                    }
                } catch (error) {
                    console.error(`Failed to get rate for ${dateString}:`, error);
                    // Если это ошибка соединения, прекращаем дальнейшие запросы
                    if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_RESET')) {
                        hasConnectionError = true;
                        console.log('Connection error detected, stopping further requests');
                    }
                }
                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
            }
        }
        
        currentDate.setDate(currentDate.getDate() + dataInterval);
    }

    // Выводим итоговую информацию о кэше
    console.log(`[Cache Summary] Total dates: ${cachedDates.length + requestedDates.length}`);
    console.log(`[Cache Summary] From cache: ${cachedDates.length} dates`);
    console.log(`[Cache Summary] From API: ${requestedDates.length} dates`);
    
    return historicalRates;
}

// Вспомогательные функции
function formatDateToDDMMYY(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
}

function getDateNDaysAgo(n) {
    const date = new Date();
    date.setDate(date.getDate() - n);
    return date.toISOString().split('T')[0];
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

function removeActiveClasses() {
    monthButton.classList.remove('active');
    yearButton.classList.remove('active');
    allTimeButton.classList.remove('active');
}

// Обновление графика
function updateChart(startDate, endDate, period, clickedButton) {
    removeActiveClasses();
    clickedButton.classList.add('active');
    createChart(startDate, endDate, currentFromCurrency, currentToCurrency, period);
}

function updateChartBasedOnActivePeriod() {
    const activeButton = document.querySelector('.period-button.active');
    if (!activeButton) return;

    let startDate, endDate, period;

    if (activeButton === monthButton) {
        endDate = new Date().toISOString().split('T')[0];
        startDate = getDateNDaysAgo(30);
        period = 'month';
    } else if (activeButton === yearButton) {
        endDate = new Date().toISOString().split('T')[0];
        startDate = getDateNDaysAgo(365);
        period = 'year';
    } else if (activeButton === allTimeButton) {
        startDate = "2023-01-01";
        endDate = new Date().toISOString().split('T')[0];
        period = 'all';
    }

    if (startDate && endDate && period) {
        updateChart(startDate, endDate, period, activeButton);
    }
}

// Обработчики событий
toggleChartButton.addEventListener('click', () => {
    if (chartCanvas.style.display === 'none' || chartCanvas.style.display === '') {
        chartCanvas.style.display = 'block';
        toggleChartButton.textContent = 'Скрыть график';
    } else {
        chartCanvas.style.display = 'none';
        toggleChartButton.textContent = 'Показать график';
    }
});

swapButton.addEventListener('click', () => {
    [currentFromCurrency, currentToCurrency] = [currentToCurrency, currentFromCurrency];
    
    // Обновляем отображение выбранных валют
    const fromSelect = document.querySelector('#from-currency');
    const toSelect = document.querySelector('#to-currency');
    
    if (fromSelect && toSelect) {
        const fromOption = fromSelect.querySelector(`.select-items div[data-value="${currentFromCurrency}"]`);
        const toOption = toSelect.querySelector(`.select-items div[data-value="${currentToCurrency}"]`);
        
        if (fromOption && toOption) {
            const fromSelected = fromSelect.querySelector('.select-selected');
            const toSelected = toSelect.querySelector('.select-selected');
            
            fromSelected.textContent = fromOption.textContent;
            toSelected.textContent = toOption.textContent;
            
            fromSelect.querySelectorAll('.select-items div').forEach(div => div.classList.remove('same-as-selected'));
            toSelect.querySelectorAll('.select-items div').forEach(div => div.classList.remove('same-as-selected'));
            
            fromOption.classList.add('same-as-selected');
            toOption.classList.add('same-as-selected');
        }
    }
    
    // Анимация кнопки
    const icon = swapButton.querySelector('i');
    if (icon) {
        icon.style.transform = 'rotate(180deg)';
        setTimeout(() => {
            icon.style.transform = 'rotate(0deg)';
        }, 300);
    }
    
    convertCurrency();
    updateChartBasedOnActivePeriod();
});

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

fromAmountInput.addEventListener('input', convertCurrency);

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', async () => {
    await CurrencyCache.cleanup();
    await CurrencyAPIService.preCacheEssentialRates();
    initCustomSelects();
    convertCurrency();
    
    // Устанавливаем активную кнопку периода
    monthButton.classList.add('active');
    
    // Строим первоначальный график
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = getDateNDaysAgo(30);
    createChart(thirtyDaysAgo, today, currentFromCurrency, currentToCurrency, 'month');
});