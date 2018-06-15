var IStorage = (function() {
  var
    CLASS_NAMES = {
      iframe: 'istorage js-istorage',
    },
    ACTION_TYPES = {
      getRequest: 'getRequest',
      getResponse: 'getResponse',

      setRequest: 'setRequest',
      setResponse: 'setResponse',

      triggerRequest: 'triggerRequest',
      triggerResponse: 'triggerResponse',
    },
    _requestID = 0,
    _requests = {},
    _listeners = {},
    _$iframe;

  function _sendMessage(data) {
    _isIframeLoaded() ?
      _postMessageOnCurrentWindow(data) :
      _sendMessageOnIframeLoad(function() { _postMessageOnCurrentWindow(data); });
  }

  function _sendMessageOnIframeLoad(sendMessageFn) {
    if (!_$iframe) { _$iframe = _insertIntoBody(_createIframe()); }

    _$iframe.on('load', function() {
      $(this).data({isLoaded: true});

      sendMessageFn();
    });
  }

  function _postMessage(target, data) {
    target.postMessage(JSON.stringify(data), '*');
  }

  function _postMessageOnCurrentWindow(data) {
    _postMessage(_getCurrentWindow(), data);
  }

  function _getCurrentWindow() {
    return _$iframe[0].contentWindow;
  }

  function _isIframeLoaded() {
    return _$iframe && _$iframe.data('isLoaded');
  }

  function _createIframe() {
    return $('<iframe>')
      .attr({src: app.config.istorageIframeURL})
      .addClass(CLASS_NAMES.iframe);
  }

  function _insertIntoBody($iframe) {
    return $iframe.appendTo('body');
  }

  function _callEventListeners(eventName, data) {
    _listeners[eventName] && _listeners[eventName].forEach(function(listener) {
      listener(data);
    });
  }

  function _processPostMessage(sourceWindow, data) {
    var payload = data.payload;

    switch(data.type) {
      case ACTION_TYPES.getRequest:
        _postMessage(
          sourceWindow,
          {
            type: ACTION_TYPES.getResponse,
            payload: {
              value: localStorage.getItem(payload.key),
              requestID: payload.requestID,
            }
          }
        );
        break;

      case ACTION_TYPES.setRequest:
        localStorage.setItem(payload.key, payload.value);
        _postMessage(
          sourceWindow,
          {
            type: ACTION_TYPES.setResponse,
            payload: {
              key: payload.key,
              value: payload.value,
              requestID: payload.requestID,
            }
          }
        );
        break;

      case ACTION_TYPES.setResponse:
        _callRequestCallback(payload.requestID, {
          key: payload.key,
          value: payload.value,
          source: sourceWindow,
        });
        break;

      case ACTION_TYPES.getResponse:
        _callRequestCallback(
          payload.requestID,
          payload.value,
          sourceWindow
        );
        break;

      case ACTION_TYPES.triggerRequest:
        localStorage.setItem(
          payload.eventName,
          JSON.stringify({
            data: payload.data,
            requestID: payload.requestID,
          })
        );
        localStorage.removeItem(payload.eventName);
        break;

      case ACTION_TYPES.triggerResponse:
        _callEventListeners(payload.eventName, payload.data);
        _callRequestCallback(payload.requestID);
        break;
    }
  }

  function _parseJSON(data) {
    var parsedData;

    try { parsedData = JSON.parse(data); }
    catch(error) { return; }

    return parsedData;
  }

  function _onMessage(event) {
    var parsedData = _parseJSON(event.data);

    parsedData && _processPostMessage(event.source, parsedData);
  }

  function _onStorage(event) {
    if (!event.newValue) { return; }

    var parsedNewValue = _parseJSON(event.newValue);

    _postMessage(
      window.parent,
      {
        type: ACTION_TYPES.triggerResponse,
        payload: {
          eventName: event.key,
          data: parsedNewValue && parsedNewValue.data,
          requestID: parsedNewValue && parsedNewValue.requestID,
        },
      }
    );
  }

  function _cacheRequest(callback) {
    _requests[++_requestID] = callback;
  }

  function _onSendMessage(data) {
    _cacheRequest(data.callback);

    _sendMessage({
      type: data.type,
      payload: $.extend({}, data.payload, {requestID: _requestID}),
    });
  }

  function _getData(key, onGet) {
    _onSendMessage({
      type: ACTION_TYPES.getRequest,
      callback: onGet,
      payload: {key: key},
    });
  }

  function _setData(key, value, onSet) {
    _onSendMessage({
      type: ACTION_TYPES.setRequest,
      callback: onSet,
      payload: {
        key: key,
        value: value,
      },
    });
  }

  function _callRequestCallback(requestID, data, sourceWindow) {
    _requests[requestID] && _requests[requestID](data, sourceWindow);
    delete _requests[requestID];
  }

  function _triggerEventOnStorage(eventName, data, onAfterListen) {
    _onSendMessage({
      type: ACTION_TYPES.triggerRequest,
      callback: onAfterListen,
      payload: {
        eventName: eventName,
        data: data,
      },
    });
  }

  function _onTriggerEvent(key, callback) {
    if (_listeners[key]) {
      _listeners[key].push(callback);
    } else {
      _listeners[key] = [callback];
    }
  }

  function _removeEventListeners(eventName) {
    delete _listeners[eventName];
  }

  function _onListenIframeWindow() {
    window.addEventListener('storage', _onStorage);
  }

  function _listener() {
    window.addEventListener('message', _onMessage);
  }

  _listener();

  return {
    get: _getData,
    set: _setData,
    trigger: _triggerEventOnStorage,
    on: _onTriggerEvent,
    removeEventListeners: _removeEventListeners,
    listenIframeWindow: _onListenIframeWindow,
  };
})();
