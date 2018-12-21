var net = require('net');

// THESE ARE MAGIC NUMBERS
var ONCOMMAND = new Buffer('7123F084', 'hex');
var OFFCOMMAND = new Buffer('7124F085', 'hex');
var QUERYCOMMAND = new Buffer('818A8B96', 'hex');

var TIMEOUT = 150; // ms to wait before abandoning command
var PORT = 5577;

function checkbitRGBW(command) {
    return (command[0] +
        command[1] +
        command[2] +
        command[3] +
        command[4] +
        command[5] +
        command[6]) % 256
}

function checkbitRGBWW(command) {
    return (command[0] +
        command[1] +
        command[2] +
        command[3] +
        command[4] +
        command[5] +
        command[6] +
        command[7]) % 256
}

function setColor(color, node) {

    node.log (color);

    var colorRed = parseInt(color.substring(1, 3), 16) || 0;
    var colorGreen = parseInt(color.substring(3, 5), 16) || 0;
    var colorBlue = parseInt(color.substring(5, 7), 16) || 0;
    var colorWhite = parseInt(color.substring(7, 9), 16) || 0;
    var colorWWhite = parseInt(color.substring(9, 11), 16) || 0;
    var command = [];

    node.log (colorRed + ", " + colorGreen + ", " + colorBlue + ", " + colorWhite + ", " + colorWWhite);
    
    if (node.style == "RGBW") {
        command = [49, 255, 255, 255, 255, 240, 15, 255]; // ANOTHER MAGIC NUMBER
        command[1] = colorRed;      // red
        command[2] = colorGreen;    // green
        command[3] = colorBlue;     // blue
        command[4] = colorWhite;    // white
        command[7] = checkbitRGBW(command);
    }
    else {
        command = [49, 255, 255, 255, 255, 255, 240, 15, 255]; // ANOTHER MAGIC NUMBER
        command[1] = colorRed;      // red
        command[2] = colorGreen;    // green
        command[3] = colorBlue;     // blue
        command[4] = colorWhite;    // white
        command[5] = colorWWhite;   // white
        command[8] = checkbitRGBWW(command);
    }
    return Buffer.from(command);
}

function setBrightness(brightness, node) {
    function DecToHexString(num, len) {
        str = num.toString(16).toUpperCase();
        return "0".repeat(len - str.length) + str;
    }
    if (isNaN(brightness)) { brightness = 100 };
    if (brightness > 100) { brightness = 100 };
    if (brightness < 0) { brightness = 0 };
    var adjustment = Math.round((brightness / 100) * 255);
    var hex = DecToHexString(adjustment);
    return (setColor('#' + hex + hex + hex + hex + hex, node));
}

module.exports = function (RED) {

    function MagicHomeUFONode(config) {
        RED.nodes.createNode(this, config);

        // initial set up
        var node = this;
        node.queue = [];
        node.ready = true;
        node.ip = config.ip;
        node.style = config.style;
        node.expectedState = { payload: { on: false, brightness: 0, color: '#FFFFFFFF' } };
        node.intervalID;
        node.missedBeats = 0;

        node.log (config.style);

        // ====== INPUT
        node.on('input', function (msg) {
            switch (msg.payload.on) {
                case true:
                    exec(ONCOMMAND);
                    break;
                case false:
                    exec(OFFCOMMAND);
                    break;
            }
            if (msg.payload.brightness !== undefined) {
                exec(setBrightness(msg.payload.brightness, node));
            }
            if (msg.payload.color !== undefined) {
                exec(setColor(msg.payload.color, node));
            }
            if (msg.payload.blink !== undefined) {
                blink();
            }
            if (msg.payload.toggle !== undefined) {
                toggle();
            }
            // on: true
            // brightness: 100
            // color : #FFFFFFFF
            // blink : true
            // toggle: true
            intervaledStatusUpdate();
        });

        // ====== CLOSE
        node.on('close', function () {
            clearInterval(node.intervalID);
        });

        // ====== INPUT
        function exec() {
            node.queue.push(arguments);
            process();
        }

        function process() {
            if (node.queue.length === 0)
                return;
            if (!node.ready)
                return;
            node.ready = false;
            send.apply(node, node.queue.shift());
            setTimeout(function () {
                node.ready = true;
                process();
            }, TIMEOUT);
        }

        function send(command, callback) {
            try {
                var client = new net.Socket();
                client.setTimeout(TIMEOUT * 2);
                var serverResponse = '';
                client.connect(PORT, node.ip, function () {
                    client.write(command);
                });
                client.on('data', function (data) {
                    try {
                        serverResponse += data.toString('hex');
                    }
                    catch (caught) { node.log(caught); }
                });
                client.on('timeout', function () {
                    client.destroy();
                });
                client.on('end', function () {
                    client.destroy();
                });
                client.on('close', function () {
                    if (callback) {
                        callback(serverResponse);
                    };
                });
            }
            catch (caught) { node.log(caught); }
        }

        function intervaledStatusUpdate() {
            send(QUERYCOMMAND, function (data) {
                if (data == "") {
                    node.missedBeat++;
                    if (node.missedBeat > 6) {
                        node.status({ fill: "red", shape: "dot", text: "NOT CONNECTED" });
                    }
                    return
                } // timeout or no response
                node.missedBeat = 0;

                var response = { payload: {} };
                var changeInState = false;

                //node.log(data);
                var colorRed = data.substring(12, 14);
                var colorGreen = data.substring(14, 16);
                var colorBlue = data.substring(16, 18);
                var colorWhite = data.substring(18, 20);
                var colorWWhite = data.substring(20, 22);
                var colorDetail = "";

                if ((colorRed == colorGreen) && (colorBlue == colorGreen) && (colorWhite == colorGreen)) {
                    var brightness = Math.round((parseInt(colorRed, 16) / 255) * 100);
                    colorDetail = " (" + brightness + "%)";
                    if (node.expectedState.payload.brightness != brightness) {
                        changeInState = true;
                        node.expectedState.payload.brightness = brightness;
                    }
                    response.payload.brightness = brightness;
                }
                else {
                    var colorValues = "#" + data.substring(12, 20);
                    colorDetail = " (#" + data.substring(12, 20) + ")";
                    if (node.expectedState.payload.color != colorValues) {
                        changeInState = true;
                        node.expectedState.payload.color = colorValues;
                    }
                    response.payload.color = colorValues;
                }

                if (data.substring(4, 6) === '23') {
                    if (!node.expectedState.payload.on) {
                        changeInState = true;
                        node.expectedState.payload.on = true;
                    }
                }
                else if (data.substring(4, 6) === '24') {
                    if (node.expectedState.payload.on) {
                        changeInState = true;
                        node.expectedState.payload.on = false;
                    }
                }

                if (changeInState) {
                    if (node.expectedState.payload.on) {
                        node.status({ fill: "yellow", shape: "dot", text: "on" + colorDetail });
                    }
                    else {
                        node.status({ fill: "grey", shape: "dot", text: "off" });
                    }
                    node.send(node.expectedState);
                }
            });
        }

        function toggle() {
            send(QUERYCOMMAND, function (data) {
                var state = data.substring(4, 6) === '23';
                if (state) {
                    exec(OFFCOMMAND);
                    exec(QUERYCOMMAND);
                    exec(OFFCOMMAND);
                }
                else {
                    exec(ONCOMMAND);
                    exec(QUERYCOMMAND);
                    exec(ONCOMMAND);
                }
                intervaledStatusUpdate();
            });
        }

        function blink() {
            send(QUERYCOMMAND, function (data) {
                var state = data.substring(4, 6) === '23';
                if (state) {
                    exec(OFFCOMMAND);
                }
                exec(ONCOMMAND);
                exec(OFFCOMMAND);
                exec(ONCOMMAND);
                if (!state) {
                    exec(OFFCOMMAND);
                    exec(QUERYCOMMAND);
                    exec(OFFCOMMAND); // some issues with the final state so send twice
                }
                else {
                    exec(QUERYCOMMAND);
                    exec(ONCOMMAND); // some issues with the final state so send twice
                }
                intervaledStatusUpdate();
            });
        }

        //TODO: make the refresh interval configurable
        node.status({ fill: "red", shape: "dot", text: "NOT CONNECTED" });
        node.intervalID = setInterval(intervaledStatusUpdate, 5000);
    }

    RED.nodes.registerType("MagicHome UFO", MagicHomeUFONode);
}