const https = require('https');
const path = require('path');
const WebSocket = require('ws');
const express = require('express');

const RemoteMetaMaskProvider = require('./RemoteMetaMaskProvider');

const DEFAULT_PORT = 3333;

class MetaMaskConnector {
  constructor(options) {
    this.config = Object.assign({}, { port: DEFAULT_PORT }, options)
  }
  async start() {
    this._app = express();
    this._app.use(express.static(path.resolve(__dirname, 'client')));
    this._wss = await this._runServer();
    await this._initialize();
  }
  stop() {
    return new Promise(resolve => {
      this._wss.close(() => {
        this._server.close(() =>{
          resolve(true);
        });
      });
    })
  }
  _runServer() {
    return new Promise((resolve, reject) => {
      this._server = this._app.listen(this.config.port, 'localhost', err => {
        if (err) return reject(err);
        resolve(new WebSocket.Server({ server: this._server }));
      });
    });
  }
  _initialize() {
    return new Promise((resolve, reject) => {
      this._wss.on('connection', ws => {
        // Only allow one conection at a time
        if (this.ready()) {
          return ws.close();
        }
        ws.on('close', () => {
          delete this._ws;
        })
        this._ws = ws;
        if (this.config.onConnect) this.config.onConnect();
        resolve();
      });
    });
  }
  ready() {
    return this._ws && this._ws.readyState === WebSocket.OPEN;
  }
  _handleMessage(msg) {
    let message;
    try {
      message = JSON.parse(msg);
    } catch (e) {
      throw new Error('Could not parse message from socket. Is it valid JSON?')
    }
    const { action, payload } = message;
    return this._handleAction(action, payload);
  }
  _handleAction(action, payload) {
    if (action === 'error') {
      throw new Error(payload);
    }
    return { responseAction: action, responsePayload: payload };
  }
  send(action, payload, requiredAction) {
    return new Promise((resolve, reject) => {
      const onMsg = msg => {
        const { responseAction, responsePayload } = this._handleMessage(msg.data);
        if (requiredAction === responseAction) {
          this._ws.removeEventListener('message', onMsg);
          resolve(responsePayload);
        }
      }
      this._ws.addEventListener('message', onMsg);
      const msg = JSON.stringify({ action, payload });
      this._ws.send(msg);
    })
  }
  getProvider() {
    return new RemoteMetaMaskProvider(this);
  }
}

module.exports = MetaMaskConnector;
