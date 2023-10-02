const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();
const Pusher = require('pusher');
const cors = require('cors')

require('dotenv').config();
const appId = process.env.PUSHER_ID;
const appKey = process.env.PUSHER_KEY;
const appSecret = process.env.PUSHER_SECRET;
const cluster = process.env.PUSHER_CLUSTER;
const port = process.env.PORT;

//initialize Pusher with your appId, key, secret and cluster
const pusher = new Pusher({
    appId: appId,
    key: appKey,
    secret: appSecret,
    cluster: cluster,
    useTLS: true
});

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// CORS middleware
app.use(cors())

app.get('/', (req, res) => {
    res.send('Welcome')
});

// API route in which the price information will be sent to from the clientside
app.post('/prices/new', (req, res) => {
    // Trigger the 'prices' event to the 'coin-prices' channel
    req.body.json().then((res) => {
        pusher.trigger( 'coin-prices', 'prices', {
            ...res
        });
    }).catch((err) => console.error(err))
    res.sendStatus(200);
});

app.listen(port, () => {
    console.log('Node app is running on port', port)
})