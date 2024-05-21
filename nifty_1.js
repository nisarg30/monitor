const express = require('express');
const cron = require('node-cron');
const TradingView = require('@mathieuc/tradingview');
const axios = require('axios');
const mongoose = require('mongoose');
const storage = require('./model.js')

async function connectToDatabase() {
    try {
        mongoose.set("strictQuery", false);
        await mongoose.connect('mongodb+srv://nisargpatel0466:nn__4569@cluster0.lsqbqko.mongodb.net/trigger?retryWrites=true&w=majority');

        const db = mongoose.connection;
        db.on('error', console.error.bind(console, 'connection error:'));
        db.once('open', () => {
        console.log('Connected to the database successfully!');
        });
    } catch (error) {
        console.error('Error connecting to the database:', error);
    }
}

connectToDatabase();

const app = express();
const port = 3000;

async function writeCandlestickDataToServer(stockName, confirmationPeriods, chartPeriods, tf, dir) {
    const header = 'Timestamp,Open,Max,Min,Volume,wvf,wvfl,rangeHigh,rangeHighl,Close\n';
    const rows = confirmationPeriods.map((data, index) => {
        const chartData = chartPeriods[index];
        return `${chartData.time},${chartData.open},${chartData.max},${chartData.min},${chartData.volume},${data.wvf},${data.wvfl},${data.rangeHigh},${data.rangeHighl},${chartData.close}\n`;
    });
    const csvContent = header + rows.join('');

    try {
        const response = await axios.post("https://trigger-1.onrender.com/nifty_1", {
            csvData: csvContent,
            stockName: stockName,
            tf: tf,
            dir: dir
        });
        console.log('CSV data sent successfully to the server');
        console.log('Server response:', response.data);
        var quey = stockName + '_' + tf;
        const filter = { stockname: quey };
        const logEntry = {
            time : chartPeriods[0].time,
            direction : dir,
            result : response.data[0]
        };
        const update = { $push: { log: logEntry } };
        const result = await storage.updateOne(filter, update);
        console.log('Update result:', result);

    } catch (error) {
        console.error('Error sending CSV data to the server:', error);
    }
}

const xyz = async (stockname, tf) => {
    console.log(stockname, tf);
    const client = new TradingView.Client({
        // token: 'xajjrhtxu2peve0li7lfje3vpmiho4b0',
        // signature: 'v2:SqjPdUb4iLLB/WJW3tlMYIZFOlcXT6f2oceM/5bCNlw=',
    });

    const chart = new client.Session.Chart();
    chart.setMarket(`NSE:${stockname}`, {
        timeframe: tf,
        range: 10000000,
    });

    const indicator = await TradingView.getIndicator('USER;f691a941ff2d44fc8b6ac9020465b2b4');

    const ConfirmationEntry = new chart.Study(indicator);

    chart.onUpdate(async () => {
        console.log('Plot values chart : ', ConfirmationEntry.periods[0], chart.periods[0]);
        if (ConfirmationEntry.periods[0] == undefined) return;

        if (ConfirmationEntry.periods[1].Shapes === 1) {
            writeCandlestickDataToServer(chart.infos.name, ConfirmationEntry.periods.splice(0, 200), chart.periods.splice(0, 200), '1', 1);
        } else if (ConfirmationEntry.periods[1].Shapes_2 === 1) {
            writeCandlestickDataToServer(chart.infos.name, ConfirmationEntry.periods.splice(0, 200), chart.periods.splice(0, 200), '1', 0);
        }
    });

    return client.end();
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

let fetchTask;

async function fetchDataWithDelay() {
    await xyz("NIFTY", '1');
}

cron.schedule('0 9 * * 1-5', () => {
    console.log('Starting fetchDataWithDelay at 9 AM IST on weekdays');
    fetchTask = fetchDataWithDelay();
}, {
    timezone: 'Asia/Kolkata'
});

cron.schedule('45 15 * * 1-5', () => {
    console.log('Stopping fetchDataWithDelay at 3:45 PM IST on weekdays');
    fetchTask = null; 
}, {
    timezone: 'Asia/Kolkata'
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
