// Настройки
const apiKey = "fca_live_ITlChiZleoIKcGDffxe8kO702x4I9woZ42ZivbK2";
const baseCurrency = 'USD';
const lineColor = 'rgb(48, 68, 99)';

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

// Функция для инициализации выпадающих списков
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
            } 
            else {
                currentToCurrency = selectedOption.getAttribute("data-value");
            }
        }
        
        // Обработчик клика по выбранному элементу
        selected.addEventListener("click", function(e) {
            e.stopPropagation();
            closeAllSelects(this);
            this.nextElementSibling.style.display = this.nextElementSibling.style.display === "block" ? "none" : "block";
            this.classList.toggle("select-arrow-active");
        });
        
        //Обработчик для опций в выпадающем списке
        options.forEach(option => {
            option.addEventListener("click", function() {
                // Обновляем выбранное значение
                selected.textContent = this.textContent;
                selected.classList.remove("select-arrow-active");
                items.style.display = "none";
                
                options.forEach(opt => opt.classList.remove("same-as-selected"));
                this.classList.add("same-as-selected");
                
                // Обновляем текущую валюту
                const value = this.getAttribute("data-value");
                if (select.parentElement.querySelector("label").textContent.includes("Из валюты")) {
                    currentFromCurrency = value;
                } 
                else {
                    currentToCurrency = value;
                }
                
                // Вызываем конвертацию и обновление графика
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

// Основные функции
// Получаем текущий курс валюты относительно USD
async function getExchangeRateFromUSD(targetCurrency) {
    try {
        const url = `https://api.freecurrencyapi.com/v1/latest?apikey=${apiKey}&currencies=${targetCurrency}&base_currency=${baseCurrency}`;
        console.log("Fetching URL:", url);
        
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}. Проверьте API-ключ и параметры запроса.`);
        }

        const data = await response.json();
        console.log("API Response:", data);
        
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
        showError("Ошибка соединения с сервером. Попробуйте позже.");
        return null;
    }
}

// Основная функция конвертации валют
async function convertCurrency() {
    const amount = parseFloat(fromAmountInput.value);
    hideError();
    
    // Проврки
    if (isNaN(amount) || fromAmountInput.value.trim() === '') {
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

    const fromCurrency = currentFromCurrency;
    const toCurrency = currentToCurrency;
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

// Получаем исторические данные для графика
async function getHistoricalData(startDate, endDate, fromCurrency, toCurrency, period) {
    try {
        const historicalRates = {};
        let currentDate = new Date(startDate);
        const endDateObj = new Date(endDate);
        let dataInterval = 7;
        if (period === 'year') dataInterval = 30;
        else if (period === 'all') dataInterval = 90;

        while (currentDate <= endDateObj) {
            const dateString = currentDate.toISOString().split('T')[0];
            const url = `https://api.freecurrencyapi.com/v1/historical?apikey=${apiKey}&date=${dateString}&currencies=${toCurrency}&base_currency=${fromCurrency}`;
            console.log("Fetching historical URL:", url);
            
            try {
                const response = await fetch(url, {
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    console.error(`Ошибка HTTP для ${dateString}: ${response.status}`);
                    currentDate.setDate(currentDate.getDate() + dataInterval);
                    continue;
                }

                const data = await response.json();
                console.log("Historical API Response:", data);
                
                if (data.data && data.data[dateString] && data.data[dateString][toCurrency]) {
                    historicalRates[dateString] = data.data[dateString][toCurrency];
                } 
                else {
                    console.error(`Нет данных для ${dateString}`);
                }
            } 
            catch (error) {
                console.error(`Ошибка для даты ${dateString}:`, error);
            }
            
            currentDate.setDate(currentDate.getDate() + dataInterval);
            if (currentDate > endDateObj) break;
        }
        
        return Object.keys(historicalRates).length > 0 ? historicalRates : null;
    } 
    catch (error) {
        console.error("Ошибка при получении исторических данных:", error);
        showError("Ошибка загрузки исторических данных");
        return null;
    }
}

function showError(message) {
    amountError.textContent = message;
    amountError.style.display = 'block';
    fromAmountInput.classList.add('error');
    
    setTimeout(hideError, 5000);
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

// Создаем/обновляем график
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

    // Создание графика
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

function formatDateToDDMMYY(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
}

function getDateNDaysAgo(n) {
    const today = new Date();
    const pastDate = new Date(today);
    pastDate.setDate(today.getDate() - n);
    return pastDate.toISOString().slice(0, 10);
}

function updateChart(startDate, endDate, period, clickedButton) {
    const fromCurrency = currentFromCurrency;
    const toCurrency = currentToCurrency;

    removeActiveClasses(); 
    clickedButton.classList.add('active');

    createChart(startDate, endDate, fromCurrency, toCurrency, period);
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
    if (currencyChart) {
        currencyChart.options.scales.x.title.font = getFontSize();
        currencyChart.options.scales.x.ticks.font = getFontSize();
        currencyChart.options.scales.y.title.font = getFontSize();
        currencyChart.options.scales.y.ticks.font = getFontSize();
        currencyChart.update();
    }
});

toggleChartButton.addEventListener('click', () => {
    if (chartCanvas.style.display === 'none' || chartCanvas.style.display === '') {
        chartCanvas.style.display = 'block';
        toggleChartButton.textContent = 'Скрыть график';
    } else {
        chartCanvas.style.display = 'none';
        toggleChartButton.textContent = 'Показать график';
    }
});

// Меняем местами валюты
swapButton.addEventListener('click', () => {
    console.log("Кнопка свапа нажата!");
    hideError();
    
    const temp = currentFromCurrency;
    currentFromCurrency = currentToCurrency;
    currentToCurrency = temp;
    
    const fromSelect = document.querySelector('#from-currency');
    const toSelect = document.querySelector('#to-currency');
    
    if (!fromSelect || !toSelect) {
        console.error("Ошибка: элементы #from-currency или #to-currency не найдены!");
        return;
    }
    
    const fromOption = fromSelect.querySelector(`.select-items div[data-value="${currentFromCurrency}"]`);
    const toOption = toSelect.querySelector(`.select-items div[data-value="${currentToCurrency}"]`);
    
    if (!fromOption || !toOption) {
        console.error("Ошибка: не найдены опции для выбранных валют!");
        return;
    }
    
    const fromSelected = fromSelect.querySelector('.select-selected');
    const toSelected = toSelect.querySelector('.select-selected');
    
    if (fromSelected && toSelected) {
        fromSelected.textContent = fromOption.textContent;
        toSelected.textContent = toOption.textContent;
        
        fromSelect.querySelectorAll('.select-items div').forEach(div => div.classList.remove('same-as-selected'));
        toSelect.querySelectorAll('.select-items div').forEach(div => div.classList.remove('same-as-selected'));
        
        fromOption.classList.add('same-as-selected');
        toOption.classList.add('same-as-selected');
    }
    
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

// Инициализация
monthButton.classList.add('period-button');
yearButton.classList.add('period-button');
allTimeButton.classList.add('period-button');

initCustomSelects();

// Выполняем первоначальную конвертацию
convertCurrency();

// Строим первоначальный график
const today = new Date().toISOString().split('T')[0];
const thirtyDaysAgo = getDateNDaysAgo(30);
updateChart(thirtyDaysAgo, today, 'month', monthButton);