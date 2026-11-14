// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

// Captured from Chromium 157 with a data channel and Google STUN after ICE gathering completed;
// the public addresses were replaced with documentation addresses.
export const CHROME_OFFER: RTCSessionDescriptionInit = {
  type: "offer",
  sdp: [
    "v=0",
    "o=- 4692858713019432312 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0",
    "a=extmap-allow-mixed",
    "a=msid-semantic: WMS",
    "m=application 58437 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 198.51.100.23",
    "a=candidate:2721228787 1 udp 2113937151 04567413-ba03-48a2-800b-b2b3248c0209.local 58437 typ host generation 0 network-cost 999",
    "a=candidate:17412850 1 udp 2113939711 faa4fbec-a13b-46ad-bc5f-3634fb5453a9.local 54301 typ host generation 0 network-cost 999",
    "a=candidate:1399622963 1 udp 1677732095 2001:db8:7bc1:8000:a81d:95f8:ed86:a969 54301 typ srflx raddr :: rport 0 generation 0 network-cost 999",
    "a=candidate:850584255 1 udp 1677729535 198.51.100.23 58437 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-cost 999",
    "a=ice-ufrag:Z6zJ",
    "a=ice-pwd:NJKo1aLaH9tFyoeZQxpM8dDU",
    "a=ice-options:trickle",
    "a=fingerprint:sha-256 20:D4:5C:01:C7:F4:A7:91:A2:F1:F3:DC:72:CB:EB:87:5A:13:D0:E9:0D:EB:97:1E:C9:50:B5:04:70:CC:E9:69",
    "a=setup:actpass",
    "a=mid:0",
    "a=sctp-port:5000",
    "a=max-message-size:262144",
    "",
  ].join("\r\n"),
};

export const CHROME_ANSWER: RTCSessionDescriptionInit = {
  type: "answer",
  sdp: [
    "v=0",
    "o=- 5133016538597185722 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0",
    "a=extmap-allow-mixed",
    "a=msid-semantic: WMS",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    "a=candidate:641206498 1 udp 2113937151 04567413-ba03-48a2-800b-b2b3248c0209.local 34709 typ host generation 0 network-cost 999",
    "a=candidate:507268354 1 udp 2113939711 faa4fbec-a13b-46ad-bc5f-3634fb5453a9.local 36462 typ host generation 0 network-cost 999",
    "a=ice-ufrag:RSPZ",
    "a=ice-pwd:HAEzN+ucp1ZZOo/EmZsSLcqU",
    "a=ice-options:trickle",
    "a=fingerprint:sha-256 B1:BE:17:8E:AC:6A:50:71:9A:03:56:DC:44:6F:6C:23:F1:FB:85:75:10:E5:AB:95:F2:F6:90:7F:67:B9:E4:ED",
    "a=setup:active",
    "a=mid:0",
    "a=sctp-port:5000",
    "a=max-message-size:262144",
    "",
  ].join("\r\n"),
};

// Firefox layout with fingerprint at session level, upper-case transports and a TCP candidate;
// values are random stand-ins, not a capture.
export const FIREFOX_OFFER: RTCSessionDescriptionInit = {
  type: "offer",
  sdp: [
    "v=0",
    "o=mozilla...THIS_IS_SDPARTA-128.0 7298917104427332817 0 IN IP4 0.0.0.0",
    "s=-",
    "t=0 0",
    "a=fingerprint:sha-256 91:2F:39:46:11:28:60:6A:34:CC:45:21:4E:3D:E1:E8:E3:C8:69:0F:62:93:1D:A9:16:EB:5B:FC:22:0F:7F:58",
    "a=group:BUNDLE 0",
    "a=ice-options:trickle",
    "a=msid-semantic:WMS *",
    "m=application 61283 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 203.0.113.7",
    "a=candidate:0 1 UDP 2122252543 11d5f05f-dbf6-4e33-94a9-97d1629c9358.local 61283 typ host",
    "a=candidate:2 1 TCP 2105524479 11d5f05f-dbf6-4e33-94a9-97d1629c9358.local 9 typ host tcptype active",
    "a=candidate:1 1 UDP 1686052863 203.0.113.7 61283 typ srflx raddr 0.0.0.0 rport 0",
    "a=sendrecv",
    "a=end-of-candidates",
    "a=ice-pwd:2145126f7e2479c4eecb9c1c8b80a122",
    "a=ice-ufrag:70352c3e",
    "a=mid:0",
    "a=setup:actpass",
    "a=sctp-port:5000",
    "a=max-message-size:1073741823",
    "",
  ].join("\r\n"),
};
