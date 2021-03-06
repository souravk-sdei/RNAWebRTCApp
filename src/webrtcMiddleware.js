// @flow
import { WEBTRC_EXCHANGE, CREATE_OFFER, EXCHANGE, SEND_MESSAGE } from './actions/types';
import { incommingMessage, datachannelOpened } from './actions';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';

const webrtcMiddleware = (function() {
    let socketId = null;
    const configuration = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};
    const connection = {'optional': [{'DtlsSrtpKeyAgreement': true}, {'RtpDataChannels': true }]};
    const peerconn = new RTCPeerConnection(configuration, connection);
    // const sdpConstraints = {'mandatory': { 'OfferToReceiveAudio': false, 'OfferToReceiveVideo': false }};
    const offerOpts = { offertoreceiveaudio: false, offertoreceivevideo: false }

    peerconn.onnegotiationneeded = function(event) {
      console.log('onnegotiationneeded');
    };
    peerconn.oniceconnectionstatechange = function(event) {
        console.log('oniceconnectionstatechange');
    };
    peerconn.onsignalingstatechange = function() {
        console.log('onsignalingstatechange');
    };
    peerconn.onaddstream = function() {
        console.log('onaddstream');
    };
    peerconn.onremovestream = function() {
        console.log('onremovestream');
    };

    function logError(error) {
        console.log("logError", error);
    }
    function createOffer(store, socketId, action) {
        const dataChannel = peerconn.createDataChannel("text_chan", { reliable: false });
        peerconn.createOffer(offerOpts)
            .then(desc => {
                peerconn.setLocalDescription(desc)
                    .then(() => {
                        store.dispatch({ type: EXCHANGE, payload: {'to': action.payload, 'sdp': peerconn.localDescription } })
                    })
                    .catch(err => console.error("createOffer error : ", err))
            })

        dataChannel.onopen = function() {
            console.log('dataChannel.onopen');
            store.dispatch(datachannelOpened());
        };
        dataChannel.onclose = function () {
            console.log("dataChannel.onclose");
        };
        dataChannel.onmessage = function (event) {
            console.log("dataChannel.onmessage [incomming message]:", event.data);
            store.dispatch(incommingMessage(socketId, event.data));
        };
        dataChannel.onerror = function (error) {
            console.log("dataChannel.onerror", error);
        };
        peerconn.textDataChannel = dataChannel;
    }
    function exchange(store, data) {
        if(socketId === null) {
            socketId = data.from;
        }
        if (data.sdp) {
            console.log('exchange sdp', data);
            peerconn.setRemoteDescription(new RTCSessionDescription(data.sdp))
                .then(() => {
                    if (peerconn.remoteDescription.type === "offer") {
                        peerconn.createAnswer(offerOpts)
                            .then(desc => {
                                peerconn.setLocalDescription(desc)
                                    .then(() => {
                                        store.dispatch({ type: EXCHANGE, payload: {'to': data.from, 'sdp': peerconn.localDescription } });
                                    })
                                    .catch(err => console.error("exchange sdp error : ", err))
                            })
                    }
                })
        } else {
            console.log('exchange candidate');
            peerconn.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }
    return store => next => action => {
        peerconn.onicecandidate = function(event) {
          console.log('onicecandidate');
          if(event.candidate && socketId !== null) {
              store.dispatch({ type: EXCHANGE, payload: {'to': socketId, 'candidate': event.candidate } })
          }
        };
        peerconn.ondatachannel = function(event) {
            const receiveChannel = event.channel;
            if(!peerconn.textDataChannel) {
                peerconn.textDataChannel = receiveChannel;
                store.dispatch(datachannelOpened());
            }
        }

        switch(action.type) {
            case CREATE_OFFER:
                socketId = action.payload;
                createOffer(store, socketId, action);
                break;
            case WEBTRC_EXCHANGE:
                exchange(store, action.payload);
                break;
            case SEND_MESSAGE:
                peerconn.textDataChannel.send(action.payload);
                break;
            default:
                return next(action);
        }
    }
})();

export { webrtcMiddleware };
