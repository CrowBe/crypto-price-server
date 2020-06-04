const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();
const Pusher = require('pusher');

require('dotenv').config();
const appId = process.env.REACT_APP_PUSHER_ID;
const appKey = process.env.REACT_APP_PUSHER_KEY;
const appSecret = process.env.REACT_APP_PUSHER_SECRET;
const cluster = process.env.REACT_APP_PUSHER_CLUSTER;
const port = 5000;

//initialize Pusher with your appId, key, secret and cluster
const pusher = new Pusher({
    appId: appId,
    key: appKey,
    secret: appSecret,
    cluster: cluster,
    encrypted: true
});

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// CORS middleware
app.use((req, res, next) => {
    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*')
    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')
    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type')
    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', false)
    // Pass to next layer of middleware
    next()
});

app.set('port', (5000))

app.get('/', (req, res) => {
    res.send('Welcome')
});

// API route in which the price information will be sent to from the clientside
app.post('/prices/new', (req, res) => {
    // Trigger the 'prices' event to the 'coin-prices' channel
    pusher.trigger( 'coin-prices', 'prices', {
        prices: req.body.prices
    });
    res.sendStatus(200);
});

app.listen(app.get('port'), () => {
    console.log('Node app is running on port', app.get('port'))
})