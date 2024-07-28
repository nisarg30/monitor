const express = require('express');
const cron = require('node-cron');
const TradingView = require('@mathieuc/tradingview');
const axios = require('axios');
const mongoose = require('mongoose');
const storage = require('./model.js');

let isFetching = false;  // Global flag to indicate fetching status
let client = null;       // Global client variable
let initialLoadTimeout = null; // Timeout for initial load check

function logWithTimestamp(message) {
    const now = new Date();
    const timestamp = now.toISOString();
    console.log(`[${timestamp}] ${message}`);
}

async function connectToDatabase() {
    try {
        mongoose.set("strictQuery", false);
        await mongoose.connect('mongodb+srv://nisargpatel0466:nn__4569@cluster0.lsqbqko.mongodb.net/trigger?retryWrites=true&w=majority');

        const db = mongoose.connection;
        db.on('error', console.error.bind(console, 'connection error:'));
        db.once('open', () => {
            logWithTimestamp('Connected to the database successfully!');
        });
    } catch (error) {
        logWithTimestamp('Error connecting to the database:', error);
    }
}

connectToDatabase();

const app = express();
const port = 3011;

async function writeCandlestickDataToServer(stockName, confirmationPeriods, chartPeriods, tf, dir) {
    const header = 'Timestamp,Open,Max,Min,Volume,wvf,wvfl,rangeHigh,rangeHighl,Close\n';
    const rows = confirmationPeriods.map((data, index) => {
        const chartData = chartPeriods[index];
        return `${chartData.time},${chartData.open},${chartData.max},${chartData.min},${chartData.volume},${data.wvf},${data.wvfl},${data.rangeHigh},${data.rangeHighl},${chartData.close}\n`;
    });
    const csvContent = header + rows.join('');

    try {
        const response = await axios.post("http://localhost:8000/banknifty_1", {
            csvData: csvContent,
            stockName: stockName,
            tf: tf,
            dir: dir
        });
        logWithTimestamp('CSV data sent successfully to the server');
        const date = new Date();
        const options = {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: false
        };

        const kolkataDateTime = new Intl.DateTimeFormat('en-GB', options).format(date);
        console.log('result : ',kolkataDateTime, response.data);

        const quey = stockName + '_' + tf;
        const filter = { stockname: quey };
        const logEntry = {
            time: chartPeriods[0].time,
            direction: dir,
            result: response.data[0]
        };
        const update = { $push: { log: logEntry } };
        const result = await storage.updateOne(filter, update);
        logWithTimestamp('Update result:', result);

    } catch (error) {
        logWithTimestamp('Error sending CSV data to the server:', error);
    }
}

const xyz = async (stockname, tf) => {
    logWithTimestamp(`${stockname}, ${tf}`);
    client = new TradingView.Client({
        // token: 'xajjrhtxu2peve0li7lfje3vpmiho4b0',
        // signature: 'v2:SqjPdUb4iLLB/WJW3tlMYIZFOlcXT6f2oceM/5bCNlw=',
    });

    const chart = new client.Session.Chart();
    chart.setMarket(`NSE:${stockname}`, {
        timeframe: tf,
        range: 10000000,
    });

    const restartFunction = async () => {
        logWithTimestamp('Restarting xyz due to no updates within timeout period');
        await client.end();  
        if (isFetching) {
            await xyz(stockname, tf);
        }
    };

    initialLoadTimeout = setTimeout(restartFunction, 10000);

    let last = null;
    const indicator = await TradingView.getIndicator('USER;f691a941ff2d44fc8b6ac9020465b2b4');
    const ConfirmationEntry = new chart.Study(indicator);

    chart.onUpdate(async () => {
        if (!isFetching) {
            await client.end();
            return;
        }

        clearTimeout(initialLoadTimeout);
        initialLoadTimeout = null;

        if (ConfirmationEntry.periods[0] == undefined) return;
        
        if (ConfirmationEntry.periods[1].Shapes === 1 && last != chart.periods[1].time) {
            logWithTimestamp('Shape detected');
            last = chart.periods[1].time;
            writeCandlestickDataToServer(chart.infos.name, ConfirmationEntry.periods.splice(0, 200), chart.periods.splice(0, 200), '1', 1);
        } else if (ConfirmationEntry.periods[1].Shapes_2 === 1 && last != chart.periods[1].time) {
            logWithTimestamp('Shape 2 detected');
            last = chart.periods[1].time;
            writeCandlestickDataToServer(chart.infos.name, ConfirmationEntry.periods.splice(0, 200), chart.periods.splice(0, 200), '1', 0);
        }
    });
};

async function fetchDataWithDelay() {
    isFetching = true;
    await xyz("BANKNIFTY", '1');
}

fetchDataWithDelay();

cron.schedule('00 09 * * 1-5', () => {
    logWithTimestamp('Starting fetchDataWithDelay at 9:00 AM IST on weekdays');
    fetchDataWithDelay();
}, {
    timezone: 'Asia/Kolkata'
});

cron.schedule('40 15 * * 1-5', () => {
    logWithTimestamp('Stopping fetchDataWithDelay at 3:40 PM IST on weekdays');
    isFetching = false;  
    if (client) {
        client.end(); 
    }
    if (initialLoadTimeout) {
        clearTimeout(initialLoadTimeout);  
    }
}, {
    timezone: 'Asia/Kolkata'
});

app.listen(port, () => {
    logWithTimestamp(`Server running on port ${port}`);
});
