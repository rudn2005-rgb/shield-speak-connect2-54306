import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, PhoneOff, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AudioCallProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  currentUserId: string;
  otherUserId: string;
  otherUserName: string;
  isInitiator: boolean;
}

const AudioCall = ({ isOpen, onClose, chatId, currentUserId, otherUserId, otherUserName, isInitiator }: AudioCallProps) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callStatus, setCallStatus] = useState<"connecting" | "connected" | "ended">("connecting");
  const [callDuration, setCallDuration] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const channelRef = useRef<any>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  };

  useEffect(() => {
    if (!isOpen) return;

    console.log("AudioCall opened, isInitiator:", isInitiator);
    initializeCall();

    return () => {
      cleanup();
    };
  }, [isOpen]);

  useEffect(() => {
    if (callStatus === "connected") {
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [callStatus]);

  const formatCallDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const initializeCall = async () => {
    try {
      console.log("Initializing audio call, requesting microphone access...");
      
      // Получаем доступ только к микрофону
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      
      console.log("Microphone access granted, got stream:", stream.id);
      setLocalStream(stream);

      // Создаем peer connection
      const pc = new RTCPeerConnection(configuration);
      setPeerConnection(pc);
      console.log("PeerConnection created");

      // Добавляем локальные треки
      stream.getTracks().forEach((track) => {
        console.log("Adding audio track");
        pc.addTrack(track, stream);
      });

      // Обрабатываем входящие треки
      pc.ontrack = (event) => {
        console.log("Received remote audio track");
        const [remoteStream] = event.streams;
        if (audioRef.current) {
          audioRef.current.srcObject = remoteStream;
        }
        setCallStatus("connected");
        toast.success("Звонок подключен");
      };

      // Обрабатываем ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("Sending ICE candidate");
          sendSignalingMessage({
            type: "ice-candidate",
            candidate: event.candidate,
          });
        }
      };

      // Обрабатываем изменение состояния соединения
      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", pc.iceConnectionState);
        if (pc.iceConnectionState === "connected") {
          setCallStatus("connected");
        } else if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          toast.error("Потеряно соединение");
          handleEndCall();
        }
      };

      // Подписываемся на сообщения сигнализации ПЕРЕД созданием offer
      await subscribeToSignaling(pc);

      // Если мы инициатор звонка, создаем offer
      if (isInitiator) {
        // Небольшая задержка чтобы убедиться что второй пользователь подписался
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("Creating offer as initiator");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log("Sending offer");
        await sendSignalingMessage({
          type: "offer",
          offer: offer,
        });
      }

    } catch (error) {
      console.error("Error initializing call:", error);
      toast.error("Не удалось получить доступ к микрофону");
      onClose();
    }
  };

  const sendSignalingMessage = async (message: any) => {
    try {
      if (!channelRef.current) {
        console.error("Channel not initialized");
        return;
      }
      
      console.log("Sending signaling message:", message.type);
      await channelRef.current.send({
        type: "broadcast",
        event: "signaling",
        payload: {
          from: currentUserId,
          to: otherUserId,
          message,
        },
      });
    } catch (error) {
      console.error("Error sending signaling message:", error);
    }
  };

  const subscribeToSignaling = async (pc: RTCPeerConnection) => {
    return new Promise<void>((resolve) => {
      const channel = supabase
        .channel(`audio-call-${chatId}`)
        .on("broadcast", { event: "signaling" }, async ({ payload }) => {
          if (payload.to !== currentUserId) return;

          const { message } = payload;
          console.log("Received signaling message:", message.type);

          try {
            if (message.type === "offer") {
              console.log("Processing offer");
              await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              console.log("Sending answer");
              await sendSignalingMessage({
                type: "answer",
                answer: answer,
              });
            } else if (message.type === "answer") {
              console.log("Processing answer");
              await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
            } else if (message.type === "ice-candidate") {
              console.log("Adding ICE candidate");
              await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
            } else if (message.type === "end-call") {
              console.log("Call ended by remote peer");
              handleEndCall();
            }
          } catch (error) {
            console.error("Error processing signaling message:", error);
          }
        })
        .subscribe((status) => {
          console.log("Channel subscription status:", status);
          if (status === "SUBSCRIBED") {
            channelRef.current = channel;
            resolve();
          }
        });
    });
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const handleEndCall = () => {
    if (channelRef.current) {
      sendSignalingMessage({ type: "end-call" });
    }
    cleanup();
    onClose();
  };

  const cleanup = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (peerConnection) {
      peerConnection.close();
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    setLocalStream(null);
    setPeerConnection(null);
    setCallStatus("ended");
    setCallDuration(0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleEndCall()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Голосовой звонок
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-8">
          {/* Аватар собеседника */}
          <div className="flex flex-col items-center gap-4">
            <Avatar className="w-24 h-24">
              <AvatarFallback className="bg-primary/10 text-primary text-3xl">
                {otherUserName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h3 className="text-xl font-semibold">{otherUserName}</h3>
              <p className="text-sm text-muted-foreground">
                {callStatus === "connecting" && "Соединение..."}
                {callStatus === "connected" && formatCallDuration(callDuration)}
                {callStatus === "ended" && "Звонок завершен"}
              </p>
            </div>
          </div>

          {/* Элементы управления */}
          <div className="flex justify-center gap-4">
            <Button
              variant={isMuted ? "destructive" : "secondary"}
              size="icon"
              onClick={toggleMute}
              className="rounded-full w-16 h-16"
              disabled={callStatus !== "connected"}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </Button>

            <Button
              variant="destructive"
              size="icon"
              onClick={handleEndCall}
              className="rounded-full w-16 h-16"
            >
              <PhoneOff className="w-6 h-6" />
            </Button>
          </div>
        </div>

        {/* Скрытый audio элемент для воспроизведения удаленного аудио */}
        <audio ref={audioRef} autoPlay />
      </DialogContent>
    </Dialog>
  );
};

export default AudioCall;
