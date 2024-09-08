import Head from "next/head";
import { Inter } from "next/font/google";
import { useCallback, useEffect, useState } from "react";
import {
  createLightNode,
  waitForRemotePeer,
  Protocols,
  createEncoder,
  createDecoder,
  LightNode,
  DecodedMessage,
} from "@waku/sdk";
import protobuf from "protobufjs";

const CONTENT_TOPIC = "/ud-waku-react-testing/2/message/proto";

type Message = {
  timestamp: number;
  sender: string;
  message: string;
};

export default function Home() {
  const [node, setNode] = useState<LightNode | null>(null);

  const [isStoreFetched, setIsStoreFetched] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const [username, setUsername] = useState("");
  const [inputMessage, setInputMessage] = useState("");

  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const _username = localStorage.getItem("username");
    if (_username) {
      setUsername(_username);
    }
  }, []);

  useEffect(() => {
    (async () => {
      // Choose a content topic

      const _node = await createLightNode({
        defaultBootstrap: true,
        contentTopics: [CONTENT_TOPIC],
      });
      await _node.start();
      console.log("Node started");

      await waitForRemotePeer(_node, [
        Protocols.LightPush,
        Protocols.Filter,
        Protocols.Store,
      ]);
      console.log("Connected to remote peer");

      setNode(_node);
    })();
  }, []);

  useEffect(() => {
    if (!node) return;
    if (isStoreFetched) return;

    console.log("fetching store...");

    const decoder = createDecoder(CONTENT_TOPIC);

    (async () => {
      // Create the callback function
      const callback = (wakuMessage: DecodedMessage) => {
        const ChatMessage = new protobuf.Type("ChatMessage")
          .add(new protobuf.Field("timestamp", 1, "uint64"))
          .add(new protobuf.Field("sender", 2, "string"))
          .add(new protobuf.Field("message", 3, "string"));

        try {
          // Render the message/payload in your application
          const messageObj = ChatMessage.decode(wakuMessage.payload);
          // add to the beginning of the array
          setMessages((prev) => [messageObj as unknown as Message, ...prev]);
        } catch (error) {
          console.error(error);
        }
      };

      // Query the Store peer
      await node.store.queryWithOrderedCallback([decoder], callback);
      setIsStoreFetched(true);
    })();
  }, [isStoreFetched, node]);

  useEffect(() => {
    if (!node) return;
    if (!isStoreFetched) return;
    if (isSubscribed) return;

    console.log("subscribing...");

    (async () => {
      try {
        // Create the callback function
        const callback = (wakuMessage: DecodedMessage) => {
          // Check if there is a payload on the message
          if (!wakuMessage.payload) return;

          // Create a message structure using Protobuf
          const ChatMessage = new protobuf.Type("ChatMessage")
            .add(new protobuf.Field("timestamp", 1, "uint64"))
            .add(new protobuf.Field("sender", 2, "string"))
            .add(new protobuf.Field("message", 3, "string"));

          // Render the messageObj as desired in your application
          const messageObj = ChatMessage.decode(wakuMessage.payload);
          setMessages((prev) => [...prev, messageObj as unknown as Message]);
        };

        // Create a Filter subscription
        const { error, subscription } = await node.filter.createSubscription({
          contentTopics: [CONTENT_TOPIC],
        });

        if (error) {
          // handle errors if happens
          throw Error(error);
        }

        console.log("subscribing...");

        const decoder = createDecoder(CONTENT_TOPIC);

        // Subscribe to content topics and process new messages
        await subscription.subscribe([decoder], callback);
        setIsSubscribed(true);
      } catch (error) {
        console.error(error);
      }
    })();
  }, [isStoreFetched, isSubscribed, node]);

  const sendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!node) return;
      if (!(username && inputMessage)) return;

      console.log("sending message...");
      setIsSending(true);

      // Create a message structure using Protobuf
      const ChatMessage = new protobuf.Type("ChatMessage")
        .add(new protobuf.Field("timestamp", 1, "uint64"))
        .add(new protobuf.Field("sender", 2, "string"))
        .add(new protobuf.Field("message", 3, "string"));

      // Create a new message object
      const protoMessage = ChatMessage.create({
        timestamp: Date.now(),
        sender: username,
        message: inputMessage,
      });

      // Serialise the message using Protobuf
      const serialisedMessage = ChatMessage.encode(protoMessage).finish();

      const encoder = createEncoder({
        contentTopic: CONTENT_TOPIC,
        ephemeral: true,
      });

      // Send the message using Light Push
      const result = await node.lightPush.send(encoder, {
        payload: serialisedMessage,
      });
      console.log("Message sent");
      console.log(result);
      setIsSending(false);
    },
    [inputMessage, node, username]
  );

  return (
    <>
      <Head>
        <title>UD Waku Proof-of-Concept</title>
        <meta name="description" content="Generated by create next app" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="chat-interface">
        <h1>UD Waku Proof-of-Concept</h1>
        <br />
        <hr />
        <br />
        {isSubscribed ? (
          <div className="chat-body">
            {messages.map((message, index) => (
              <div key={index} className="chat-message">
                <span>{new Date(message.timestamp).toUTCString()}</span>
                <div className="message-text">
                  {message.sender}: {message.message}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>Loading chat history...</div>
        )}
        <br />
        <hr />
        <br />
        <label htmlFor="username-input">Username: </label>
        <input
          type="text"
          id="username-input"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            localStorage.setItem("username", e.target.value);
          }}
          placeholder="Enter your username..."
        />
        <form onSubmit={sendMessage} className="chat-footer">
          <label htmlFor="message-input">Message: </label>
          <input
            type="text"
            id="message-input"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type your message..."
          />
          <button className="send-button" disabled={isSending}>
            {isSending ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </>
  );
}
