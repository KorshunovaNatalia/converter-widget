// === Элементы DOM ===
const fromAmountInput = document.getElementById('from-amount');
const fromCurrencySelect = document.getElementById('from-currency');
const toAmountInput = document.getElementById('to-amount');
const toCurrencySelect = document.getElementById('to-currency');
const oneRubRateElement = document.getElementById('one-rub-rate');
const chartCanvas = document.getElementById('currency-chart-canvas').getContext('2d');
const monthButton = document.getElementById('month-button');
const yearButton = document.getElementById('year-button');
const allTimeButton = document.getElementById('all-time-button');
const swapButton = document.getElementById('swap-button'); // Кнопка обмена

let currencyChart; // Переменная для хранения графика

// === Настройки ===
const apiKey = "fca_live_ITlChiZleoIKcGDffxe8kO702x4I9woZ42ZivbK2"; // ВАШ API-ключ
const baseCurrency = 'USD'; // Базовая валюта для API 
const lineColor = 'rgb(19, 109, 170)'; // Цвет линии графика

// Функция для удаления класса "active" со всех кнопок
function removeActiveClasses() {
    monthButton.classList.remove('active');
    yearButton.classList.remove('active');
    allTimeButton.classList.remove('active');
}

// === Функции ===

// Функция для получения курса валюты (USD -> targetCurrency)
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

    } catch (error) {
        console.error("Ошибка при получении курса:", error);
        return null; // Возвращаем null в случае ошибки
    }
}

// Функция для конвертации валюты
async function convertCurrency() {
    const amount = parseFloat(fromAmountInput.value);
    const fromCurrency = fromCurrencySelect.value;
    const toCurrency = toCurrencySelect.value;

    let rate;

    // Получаем курс USD к fromCurrency
    const rateFromUSDToFrom = await getExchangeRateFromUSD(fromCurrency);
    if (rateFromUSDToFrom === null) {
        toAmountInput.value = "Ошибка: не удалось получить курс";
        return;
    }

    // Получаем курс USD к toCurrency
    const rateFromUSDToTo = await getExchangeRateFromUSD(toCurrency);
    if (rateFromUSDToTo === null) {
        toAmountInput.value = "Ошибка: не удалось получить курс";
        return;
    }

    // Вычисляем курс fromCurrency к toCurrency
    rate = rateFromUSDToTo / rateFromUSDToFrom;

    if (rate === null) {
        toAmountInput.value = "Ошибка: не удалось получить курс";
        return;
    }

    const result = (amount * rate).toFixed(2);
    toAmountInput.value = result;

    //  Вычисляем и отображаем курс 1 fromCurrency в выбранной toCurrency
    oneRubRateElement.textContent = `1 ${fromCurrency} = ${(rate).toFixed(4)} ${toCurrency}`;
}

// Функция для получения исторических данных (FreeCurrencyAPI)
async function getHistoricalData(startDate, endDate, fromCurrency, toCurrency, period) {
    try {
        const historicalRates = {};
        let currentDate = new Date(startDate);
        const endDateObj = new Date(endDate);
        let dataInterval = 7; // Запрашиваем раз в неделю
        if (period === 'year') {
            dataInterval = 60; //Приблизительно 1 месяц
        }
        else if (period === 'all') {
            dataInterval = 365; //1 год
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

            if (data.data && data.data[formattedDate] && data.data[formattedDate][toCurrency]) { // Изменено
                historicalRates[formattedDate] = data.data[formattedDate][toCurrency]; // Изменено
            } else {
                console.error(`Нет данных для ${formattedDate}`);
            }
            currentDate.setDate(currentDate.getDate() + dataInterval);
            if (currentDate > endDateObj) { // Проверка границы цикла
                break;
             }
        }

        return historicalRates;
    } catch (error) {
        console.error("Ошибка при получении исторических данных:", error);
        return null;
    }
}

// Функция для построения графика
async function createChart(startDate, endDate, fromCurrency, toCurrency, period) {
    const historicalData = await getHistoricalData(startDate, endDate, fromCurrency, toCurrency, period);

    if (!historicalData) {
        alert("Не удалось загрузить данные для графика.");
        return;
    }

    // Подготовка данных для графика
    const labels = Object.keys(historicalData).sort(); // Даты
    const values = labels.map(date => historicalData[date]); // Курсы

    // Уничтожаем старый график (если есть)
    if (currencyChart) {
        currencyChart.destroy();
    }

    // Создаем график (упрощенный)
    currencyChart = new Chart(chartCanvas, {
        type: 'line', // Линия
        data: {
            labels: labels,
            datasets: [{
                label: `Курс ${fromCurrency} к ${toCurrency}`,
                data: values,
                borderColor: lineColor, // Цвет линии
                borderWidth: 2,
                fill: false,
                pointRadius: 3, // Размер точек
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Дата'
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

// Функция для получения даты N дней назад
function getDateNDaysAgo(n) {
    const today = new Date();
    const pastDate = new Date(today); // Создаем копию, чтобы не менять today
    pastDate.setDate(today.getDate() - n);
    return pastDate.toISOString().slice(0, 10);
}

// Функция для обновления графика с заданной датой начала
function updateChart(startDate, endDate, period, clickedButton) {
    const fromCurrency = fromCurrencySelect.value;
    const toCurrency = toCurrencySelect.value;

    removeActiveClasses(); // Удаляем класс "active" со всех кнопок
    clickedButton.classList.add('active'); // Добавляем класс "active" к нажатой кнопке

    createChart(startDate, endDate, fromCurrency, toCurrency, period);
}

// Обработчик события для кнопки обмена валют
swapButton.addEventListener('click', () => {
    const fromCurrency = fromCurrencySelect.value;
    const toCurrency = toCurrencySelect.value;

    // Меняем местами значения выпадающих списков
    fromCurrencySelect.value = toCurrency;
    toCurrencySelect.value = fromCurrency;

    // Пересчитываем курс
    convertCurrency();
});

// === Обработчики событий ===

// Конвертация валюты при изменении суммы или валюты
fromAmountInput.addEventListener('input', convertCurrency);
fromCurrencySelect.addEventListener('change', convertCurrency);
toCurrencySelect.addEventListener('change', convertCurrency);

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
    const startDate = "2023-01-01"; // Пример "всего времени". openexchangerates.org имеет ограниченную историю для бесплатных планов!
    const endDate = new Date().toISOString().split('T')[0];
    updateChart(startDate, endDate, 'all', allTimeButton);
});

// === Инициализация ===
// Добавляем класс period-button ко всем кнопкам
monthButton.classList.add('period-button');
yearButton.classList.add('period-button');
allTimeButton.classList.add('period-button');

// Конвертируем валюту при загрузке страницы
convertCurrency();

// Инициализируем график (с периодом "месяц") и подсвечиваем кнопку "месяц"
const today = new Date().toISOString().split('T')[0];
const thirtyDaysAgo = getDateNDaysAgo(30);
updateChart(thirtyDaysAgo, today, 'month', monthButton);