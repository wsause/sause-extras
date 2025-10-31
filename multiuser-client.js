AFRAME.registerComponent("multiuser", {
    init: function () {
        this.signedIn = false;
        this.username = "";
        this.avatar = "male1";
        let welcomeDialog = document.getElementById("welcome-dialog");
        let enterButton = document.getElementById("enter-button");
        let usernameInput = document.getElementById("username-input");
        let avatarModel = document.getElementById("avatar-model");
        let prevAvatarButton = document.getElementById("prev-avatar-button");
        let nextAvatarButton = document.getElementById("next-avatar-button");
        let avatars = ["male1", "male2", "male3", "female1", "female2", "female3"];
        let avatarSelection = 0;
        let path = window.location.pathname; 
        this.scene = path.replace("/", "").replace(".html", "");
        console.log(this.scene);

        welcomeDialog.hidden = false;
        avatarModel.src = document.getElementById(avatars[0]).getAttribute("src");
    
        nextAvatarButton.addEventListener("click", (event) => {
        avatarSelection += 1;
        if (avatarSelection === avatars.length) {
            avatarSelection = 0;
        }
        avatarModel.src = document.getElementById(avatars[avatarSelection]).getAttribute("src");
        });
        
        prevAvatarButton.addEventListener("click", (event) => {
        avatarSelection -= 1;
        if (avatarSelection === -1) {
            avatarSelection = avatars.length-1;
        }
        avatarModel.src = document.getElementById(avatars[avatarSelection]).getAttribute("src");
        });

        usernameInput.addEventListener("keydown", (event) => {
            let navigationKeys = ["w", "a", "s", "d", "e", "q", "arrowup", "arrowdown", "arrowleft", "arrowright"];

            if (navigationKeys.includes(event.key.toLowerCase())) {
                event.stopPropagation();
            }
        });
        
        enterButton.addEventListener("click", (event) => {
            if (usernameInput.value) {
                welcomeDialog.hidden = true;
                this.username = usernameInput.value;
                this.avatar = avatars[avatarSelection];
                this.signedIn = true;
                this.post_init();
            }
        });
    },

    post_init: function () {
        this.socket = new WebSocket("wss://" + window.location.hostname);
        this.userId = "user" + Math.floor(Math.random() * 10000);
        this.rig = document.getElementById("rig");
        let chatInput = document.getElementById("chat-input");
        this.localStream = null;
        this.peerConnections = {};
        this.sharingVideo = false;
        let videoPlane =  document.getElementById("video-plane");
        this.localScreenStream = null;
        this.sharingScreen = false;
        let screenPlane =  document.getElementById("screen-plane");

        document.getElementById("chat-box").hidden = false;

        this.socket.addEventListener("message", (event) => {
            let data = JSON.parse(event.data);

            if (data.type === "userData" && data.id !== this.userId && data.scene === this.scene) {
                let entity = document.getElementById(data.id);

                if (entity === null) {
                    entity = document.createElement("a-entity");
                    entity.setAttribute("id", data.id);
                    entity.setAttribute("gltf-model", "#" + data.avatar);
                    
                    let text = document.createElement("a-text");
                    text.setAttribute("value", data.username);
                    text.setAttribute("color", "black");
                    text.setAttribute("align", "center");
                    text.setAttribute("width", "2");
                    text.setAttribute("position", "0 0.65 0");
                    entity.appendChild(text);

                    this.el.appendChild(entity);
                }

                let position = { x: data.position.x, y: data.position.y + 1.2, z: data.position.z };
                let rotation = { x: data.rotation.x, y: data.rotation.y + 180, z: data.rotation.z }; 

                entity.setAttribute("position", position);
                entity.setAttribute("rotation", rotation);
            }

            if (data.type === "disconnect" && data.scene === this.scene) {
                let entity = document.getElementById(data.id);

                if (entity !== null) {
                    this.el.removeChild(entity);

                    let audioElement = document.getElementById("audio-" + data.id);
                    if (audioElement !== null) {
                        audioElement.remove();
                    }
                    let videoElement = document.getElementById("video-" + data.id);
                    if (videoElement !== null) {
                        videoElement.remove();
                    }   
                }

                if (this.peerConnections[data.id]) {
                    this.peerConnections[data.id].close();
                    delete this.peerConnections[data.id];
                }
            }

            if (data.type === "textMessage" && data.scene === this.scene) {
                let messages = document.getElementById("messages");
                let message = data.username + ": " + data.message + '\n';

                messages.value += message;
                messages.scrollTop = messages.scrollHeight;
            }

            if (data.type === "signal" && data.id !== this.userId && data.scene === this.scene) {
                this.addPeerConnection(data.id);

                this.peerConnections[data.id].createOffer()
                .then(offer => {
                    return this.peerConnections[data.id].setLocalDescription(offer);
                })
                .then(() => {
                    let sdp = this.peerConnections[data.id].localDescription;
                    let offer = { type: "offer", id: this.userId, target: data.id, sdp: sdp, scene: this.scene }
                    this.socket.send(JSON.stringify(offer));
                });
            }

            if (data.type === "offer" && data.id !== this.userId && data.target === this.userId && data.scene === this.scene) {
                this.addPeerConnection(data.id);

                this.peerConnections[data.id].setRemoteDescription(new RTCSessionDescription(data.sdp))
                .then(() => {
                    return this.peerConnections[data.id].createAnswer();
                })
                .then(answer => {
                    return this.peerConnections[data.id].setLocalDescription(answer);
                })
                .then(() => {
                    let sdp = this.peerConnections[data.id].localDescription;
                    let answer = { type: "answer", id: this.userId, target: data.id, sdp: sdp, scene: this.scene }
                    this.socket.send(JSON.stringify(answer));
                });
            }

            if (data.type === "answer" && data.id !== this.userId && data.target === this.userId && data.scene === this.scene) {
                this.peerConnections[data.id].setRemoteDescription(new RTCSessionDescription(data.sdp));
            }

            if (data.type === "candidate" && data.id !== this.userId && data.target === this.userId && data.scene === this.scene) {
                this.peerConnections[data.id].addIceCandidate(new RTCIceCandidate(data.candidate));
            }

            if (data.type === "video" && data.id !== this.userId && data.scene === this.scene) {
                let videoElement = document.getElementById("video-" + data.id);
                let videoEntity = document.getElementById(data.entity);

                if (data.state === true) {
                    videoEntity.setAttribute("material", "src: #video-" + data.id);
                    videoElement.play();

                    if (this.sharingVideo === true) {
                        this.sharingVideo = false;
                    }
                }
                else {
                    videoEntity.setAttribute("material", "src", "");
                }
            }

            if (data.type === "screen" && data.id !== this.userId && data.scene === this.scene) {
                let videoElement = document.getElementById("video-" + data.id);
                let videoEntity = document.getElementById(data.entity);

                if (data.state === true) {
                    videoEntity.setAttribute("material", "src: #video-" + data.id);
                    videoElement.play();

                    if (this.sharingScreen === true) {
                        this.localScreenStream.getVideoTracks()[0].stop();
                        this.sharingScreen = false; 
                    }
                }
                else {
                    videoEntity.setAttribute("material", "src", "");
                }
            }

            if (data.type === "showModel") {
                let model = document.getElementById(data.id);
                model.setAttribute("visible", "true");
            }
            
            if (data.type === "hideModel") {
                let model = document.getElementById(data.id);
                model.setAttribute("visible", "false");
            }
        });

        window.addEventListener("beforeunload", (event) => {
            if (this.socket.readyState === WebSocket.OPEN) {
                let data = { type: "disconnect", id: this.userId, scene: this.scene };
                this.socket.send(JSON.stringify(data));
            }
        });

        chatInput.addEventListener("keydown", (event) => {
            let message = chatInput.value;
            let navigationKeys = ["w", "a", "s", "d", "e", "q", "arrowup", "arrowdown", "arrowleft", "arrowright"];

            if (navigationKeys.includes(event.key.toLowerCase())) {
                event.stopPropagation();
            }
            if (event.key === 'Enter') {
                if (this.socket.readyState === WebSocket.OPEN) {
                    let data = { type: "textMessage", username: this.username, message: message, scene: this.scene };
                    this.socket.send(JSON.stringify(data));
                }
                chatInput.value = "";
            }
        });

        if (videoPlane !== null) {
            videoPlane.addEventListener("click", (event) => {
                let videoElement = document.getElementById("local-video");

                if (this.localStream && this.sharingVideo === false) {
                    videoElement.srcObject = new MediaStream(this.localStream.getVideoTracks());
                    videoPlane.setAttribute("material", "src: #local-video");
                    videoElement.play();
                    this.sharingVideo = true;

                    for (let peerId in this.peerConnections) {
                        let senders = this.peerConnections[peerId].getSenders();

                        for (let sender of senders) {
                            if (sender.track && sender.track.kind === "video") {
                                sender.replaceTrack(this.localStream.getVideoTracks()[0]);
                            }
                        }
                    }
                }
                else {
                    videoPlane.setAttribute("material", "src", "");
                    this.sharingVideo = false;
                }

                if (this.socket.readyState === WebSocket.OPEN) {
                    let data = { type: "video", id: this.userId, entity: "video-plane", state: this.sharingVideo, scene: this.scene };
                    this.socket.send(JSON.stringify(data));
                }
            });
        }

        if (screenPlane !== null) {
            screenPlane.addEventListener("click", (event) => {
                let videoElement = document.getElementById("local-video");

                if (this.sharingScreen === false) {
                    navigator.mediaDevices.getDisplayMedia({ video: true })
                    .then(stream => {
                        this.localScreenStream = stream; 

                        videoElement.srcObject = new MediaStream(this.localScreenStream.getVideoTracks());
                        screenPlane.setAttribute("material", "src: #local-video");
                        videoElement.play();
                        this.sharingScreen = true;

                        for (let peerId in this.peerConnections) {
                            let senders = this.peerConnections[peerId].getSenders();

                            for (let sender of senders) {
                                if (sender.track && sender.track.kind === "video") {
                                    sender.replaceTrack(this.localScreenStream.getVideoTracks()[0]);
                                }
                            }
                        }

                        if (this.socket.readyState === WebSocket.OPEN) {
                            let data = { type: "screen", id: this.userId, entity: "screen-plane", state: this.sharingScreen, scene: this.scene };
                            this.socket.send(JSON.stringify(data));
                        }
                    });
                }
                else {
                    screenPlane.setAttribute("material", "src", "");
                    this.localScreenStream.getVideoTracks()[0].stop();
                    this.sharingScreen = false;

                    if (this.socket.readyState === WebSocket.OPEN) {
                        let data = { type: "screen", id: this.userId, entity: "screen-plane", state: this.sharingScreen, scene: this.scene };
                        this.socket.send(JSON.stringify(data));
                    }
                }
            });
        }

        navigator.mediaDevices.getUserMedia({ audio: true, video: true })
            .then(stream => {
                this.localStream = stream;
            })
            .catch(error => {
                return navigator.mediaDevices.getUserMedia({ audio: true });
            })
            .then(stream => {
                if (this.localStream) return;

                this.localStream = stream;
            })
            .finally(() => {
                let data = { type: "signal", id: this.userId, scene: this.scene };
                this.socket.send(JSON.stringify(data));
            });
    },

    tick: function () {
        if (this.signedIn === true) {
            let position = this.rig.getAttribute("position");
            let rotation = this.rig.getAttribute("rotation");
      
            if (this.socket.readyState === WebSocket.OPEN) {
                let data = { type: "userData", scene: this.scene, id: this.userId, username: this.username, avatar: this.avatar, position: position, rotation: rotation };
                this.socket.send(JSON.stringify(data));
            }
        }
    },

    addPeerConnection: function (id) {
        let configuration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
        this.peerConnections[id] = new RTCPeerConnection(configuration); 
        
        if (this.localStream) {
            let audioTracks = this.localStream.getAudioTracks();
            if (audioTracks.length > 0) {
                this.peerConnections[id].addTrack(audioTracks[0], this.localStream);
            }
            if (this.sharingScreen === false) {
                let videoTracks = this.localStream.getVideoTracks();
                if (videoTracks.length > 0) {
                    this.peerConnections[id].addTrack(videoTracks[0], this.localStream);
                }
            }
            else {
                let screenTracks = this.localScreenStream.getVideoTracks();
                if (screenTracks.length > 0) {
                    this.peerConnections[id].addTrack(screenTracks[0], this.localScreenStream);
                }
            }
        }

        this.peerConnections[id].addEventListener("track", (event) => {
            let remoteStream = event.streams[0];
            let audioTracks = remoteStream.getAudioTracks();
            let videoTracks = remoteStream.getVideoTracks();
            
            if (audioTracks.length > 0) {
                let audioElement = document.createElement("audio");
                audioElement.id = "audio-" + id;
                audioElement.srcObject = new MediaStream(audioTracks);
                audioElement.autoplay = true;
                audioElement.style.display = "none";
                document.body.appendChild(audioElement);
            }
            if (videoTracks.length > 0) {
                let videoElement = document.createElement("video");
                videoElement.id = "video-" + id;
                videoElement.srcObject = new MediaStream(videoTracks);
                videoElement.style.display = "none";
                document.body.appendChild(videoElement);
            } 
        });

        this.peerConnections[id].addEventListener("icecandidate", (event) => {
            if (event.candidate) {
                let data = { type: "candidate", id: this.userId, target: id, candidate: event.candidate, scene: this.scene }
                this.socket.send(JSON.stringify(data));
            }
        });

        this.peerConnections[id].addEventListener("iceconnectionstatechange", (event) => {
            if (this.peerConnections[id].iceConnectionState === "connected") {
                if (this.sharingVideo === true) {
                    let data = { type: "video", id: this.userId, entity: "video-plane", state: this.sharingVideo, scene: this.scene };
                    this.socket.send(JSON.stringify(data));
                }
                if (this.sharingScreen === true) {
                    let data = { type: "screen", id: this.userId, entity: "screen-plane", state: this.sharingScreen, scene: this.scene };
                    this.socket.send(JSON.stringify(data));
                }
            }
        });
    }
});