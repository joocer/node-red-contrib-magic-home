var net = require('net');

// THESE ARE MAGIC NUMBERS
var ONCOMMAND = new Buffer('7123F084', 'hex');
var OFFCOMMAND = new Buffer('7124F085', 'hex');
var QUERYCOMMAND = new Buffer('818A8B96', 'hex');

var TIMEOUT = 150; // maximum time to wait before abandoning command
var PORT = 5577;

/* export function toggle(Controller) {
	Controller.send(QUERYCOMMAND, function (data) {
		var state = data.substring(4, 6) === '23';
		if (state) {
			Controller.off();
		}
		else {
			Controller.on();
		}
	});
}

export function blink(Controller) {
	Controller.send(QUERYCOMMAND, function (data) {
		var state = data.substring(4, 6) === '23';
		if (state) {
			Controller.off();
		}
		Controller.on();
		Controller.off();
		Controller.on();
		if (!state) {
			Controller.off();
		}
	});
}    */


function checkbit(command) {
    return (command[0] +
        command[1] +
        command[2] +
        command[3] +
        command[4] +
        command[5] +
        command[6]) % 256
}

function setBrightness(brightness) {

    if (isNaN(brightness)) { brightness = 100 };
    if (brightness > 100) { brightness = 100 };
    if (brightness < 0) { brightness = 0 };

    var command = [65, 255, 255, 255, 255, 240, 15, 255]; // ANOTHER MAGIC NUMBER
    var adjustment = Math.round((brightness / 100) * 255);
    command[1] = adjustment;  // red
    command[2] = adjustment;  // green
    command[3] = adjustment;  // blue
    command[4] = adjustment;  // ?
    command[7] = checkbit(command);
    return Buffer.from(command);
}

module.exports = function (RED) {

    function MagicHomeUFONode(config) {
        RED.nodes.createNode(this, config);

        // initial set up
        var node = this;
        node.queue = [];
        node.ready = true;
        node.ip = config.ip;
        node.expectedState = { payload: { on: false, brightness: 0 } };
        node.intervalID;

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
                exec(setBrightness(msg.payload.brightness));
            }
            // color : '#FFFFFF#
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
                    serverResponse += data.toString('hex');
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
                    }
                    ;
                });
            }
            catch (caught) { node.log(caught); }
        }

        function intervaledStatusUpdate() {
            send(QUERYCOMMAND, function (data) {

                if (data == "") { return } // timeout or no response
                var response = { payload: {} };
                var changeInState = false;

                node.log(data);
                var colorRed = data.substring(12, 14);
                var colorGreen = data.substring(14, 16);
                var colorBlue = data.substring(16, 18);
                var colorDetail = "";

                if ((colorRed == colorGreen) && (colorBlue == colorGreen)) {
                    var brightness = Math.round((parseInt(colorRed, 16) / 255) * 100);
                    colorDetail = " (" + brightness + "%)";
                    if (node.expectedState.payload.brightness != brightness) {
                        changeInState = true;
                        node.expectedState.payload.brightness = brightness;
                    }
                    response.payload.brightness = brightness;
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

        //TODO: make the refresh interval configurable
        node.status({ fill: "red", shape: "dot", text: "NOT CONNECTED" });
        node.intervalID = setInterval(intervaledStatusUpdate, 5000);
    }

    RED.nodes.registerType("MagicHome UFO", MagicHomeUFONode);
}