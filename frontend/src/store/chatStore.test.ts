import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './chatStore';
import type { ChatMessage } from '../types/chat';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `test-${Date.now()}-${Math.random()}`,
    room_id: 'room-1',
    sender_type: 'user',
    sender_id: 'user-1',
    sender_name: 'Test User',
    content: 'Hello',
    timestamp: Date.now() / 1000,
    ...overrides,
  };
}

describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.getState().clearRoomState();
  });

  describe('addMessage', () => {
    it('should add a user message', () => {
      const store = useChatStore.getState();
      const msg = makeMessage({ sender_type: 'user', content: 'Hello world' });
      store.addMessage(msg);

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].sender_type).toBe('user');
      expect(messages[0].content).toBe('Hello world');
      expect(messages[0].id).toBe(msg.id);
    });

    it('should add an agent message', () => {
      const store = useChatStore.getState();
      store.addMessage(makeMessage({ sender_type: 'agent', content: 'Hello there!' }));

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].sender_type).toBe('agent');
      expect(messages[0].content).toBe('Hello there!');
    });

    it('should add messages in order', () => {
      const store = useChatStore.getState();
      store.addMessage(makeMessage({ content: 'First' }));
      store.addMessage(makeMessage({ sender_type: 'agent', content: 'Second' }));
      store.addMessage(makeMessage({ content: 'Third' }));

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
      expect(messages[2].content).toBe('Third');
    });
  });

  describe('addUserMessage', () => {
    it('should add a user message and return ID', () => {
      const store = useChatStore.getState();
      const id = store.addUserMessage('u1', 'User', 'Hello world', 'room-1', { source: 'text' });

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(id);
      expect(messages[0].sender_type).toBe('user');
      expect(messages[0].content).toBe('Hello world');
      expect(messages[0].meta?.source).toBe('text');
    });

    it('should return unique IDs', () => {
      const store = useChatStore.getState();
      const id1 = store.addUserMessage('u1', 'User', 'First', 'room-1');
      const id2 = store.addUserMessage('u1', 'User', 'Second', 'room-1');
      expect(id1).not.toBe(id2);
    });
  });

  describe('addAgentPlaceholder', () => {
    it('should add a streaming agent placeholder', () => {
      const store = useChatStore.getState();
      const id = store.addAgentPlaceholder('agent-1', 'Agent', 'room-1');

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(id);
      expect(messages[0].sender_type).toBe('agent');
      expect(messages[0].content).toBe('');
      expect(messages[0].meta?.streaming).toBe(true);
    });
  });

  describe('updateMessage', () => {
    it('should update message content', () => {
      const store = useChatStore.getState();
      const msg = makeMessage({ content: 'Original' });
      store.addMessage(msg);

      store.updateMessage(msg.id, { content: 'Updated' });

      const messages = useChatStore.getState().messages;
      expect(messages[0].content).toBe('Updated');
    });

    it('should update top-level fields', () => {
      const store = useChatStore.getState();
      const msg = makeMessage({ sender_type: 'agent', content: 'Response' });
      store.addMessage(msg);

      store.updateMessage(msg.id, {
        processing_ms: 500,
        model: 'gpt-4',
      });

      const messages = useChatStore.getState().messages;
      expect(messages[0].processing_ms).toBe(500);
      expect(messages[0].model).toBe('gpt-4');
    });

    it('should not affect other messages', () => {
      const store = useChatStore.getState();
      const msg1 = makeMessage({ id: 'msg-1', content: 'First' });
      const msg2 = makeMessage({ id: 'msg-2', content: 'Second' });
      store.addMessage(msg1);
      store.addMessage(msg2);

      store.updateMessage('msg-1', { content: 'Updated First' });

      const messages = useChatStore.getState().messages;
      expect(messages[0].content).toBe('Updated First');
      expect(messages[1].content).toBe('Second');
    });

    it('should handle updates to non-existent messages gracefully', () => {
      const store = useChatStore.getState();
      store.addMessage(makeMessage({ content: 'Message' }));

      store.updateMessage('nonexistent', { content: 'New' });

      const messages = useChatStore.getState().messages;
      expect(messages[0].content).toBe('Message');
    });
  });

  describe('updateMessageMeta', () => {
    it('should merge meta updates', () => {
      const store = useChatStore.getState();
      const msg = makeMessage({ meta: { streaming: true } });
      store.addMessage(msg);

      store.updateMessageMeta(msg.id, { streaming: false, audio_base64: 'abc' });

      const messages = useChatStore.getState().messages;
      expect(messages[0].meta?.streaming).toBe(false);
      expect(messages[0].meta?.audio_base64).toBe('abc');
    });
  });

  describe('setMessages', () => {
    it('should replace all messages', () => {
      const store = useChatStore.getState();
      store.addMessage(makeMessage({ content: 'Old 1' }));
      store.addMessage(makeMessage({ content: 'Old 2' }));

      store.setMessages([
        makeMessage({ id: 'new-1', content: 'New 1' }),
        makeMessage({ id: 'new-2', sender_type: 'agent', content: 'New 2' }),
      ]);

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('New 1');
      expect(messages[1].content).toBe('New 2');
    });

    it('should clear messages with empty array', () => {
      const store = useChatStore.getState();
      store.addMessage(makeMessage({ content: 'Message' }));

      store.setMessages([]);

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(0);
    });

    it('should not collide local message IDs with history IDs', () => {
      const store = useChatStore.getState();
      store.setMessages([
        makeMessage({ id: 'hist-0', content: 'history 0' }),
        makeMessage({ id: 'hist-1', sender_type: 'agent', content: 'history 1' }),
      ]);

      const localId = store.addUserMessage('u1', 'User', 'new local message', 'room-1');
      const ids = useChatStore.getState().messages.map((m) => m.id);

      expect(typeof localId).toBe('string');
      expect(ids.filter((id) => id === 'hist-1')).toHaveLength(1);
      expect(ids.filter((id) => id === localId)).toHaveLength(1);
    });
  });

  describe('clearMessages', () => {
    it('should remove all messages', () => {
      const store = useChatStore.getState();
      store.addMessage(makeMessage({ content: 'First' }));
      store.addMessage(makeMessage({ sender_type: 'agent', content: 'Second' }));
      store.addMessage(makeMessage({ content: 'Third' }));

      store.clearMessages();

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(0);
    });

    it('should clear current mood snapshot', () => {
      const store = useChatStore.getState();
      store.setCurrentMood({
        user_id: 'u',
        agent_id: 'a',
        dominant_mood: { id: 'supportive', weight: 1, emoji: 'x' },
        secondary_moods: [],
        valence: 0,
        arousal: 0,
        trust: 0.6,
        intimacy: 0.3,
        interaction_count: 1,
        last_interaction: null,
      });

      store.clearMessages();
      expect(useChatStore.getState().currentMood).toBeNull();
    });

    it('should work when already empty', () => {
      const store = useChatStore.getState();
      store.clearMessages();

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(0);
    });
  });

  describe('streamingByAgent', () => {
    it('should append streaming content per agent', () => {
      const store = useChatStore.getState();
      store.appendStreamingContent('agent-1', 'Partial');
      store.appendStreamingContent('agent-1', ' response');

      expect(useChatStore.getState().streamingByAgent['agent-1']).toBe('Partial response');
    });

    it('should clear streaming content for an agent', () => {
      const store = useChatStore.getState();
      store.appendStreamingContent('agent-1', 'Content');
      store.clearStreamingContent('agent-1');

      expect(useChatStore.getState().streamingByAgent['agent-1']).toBeUndefined();
    });

    it('should reset all streaming', () => {
      const store = useChatStore.getState();
      store.appendStreamingContent('agent-1', 'Content 1');
      store.appendStreamingContent('agent-2', 'Content 2');
      store.resetStreaming();

      expect(useChatStore.getState().streamingByAgent).toEqual({});
    });
  });

  describe('currentMood', () => {
    it('should set and clear mood snapshot', () => {
      const store = useChatStore.getState();
      store.setCurrentMood({
        user_id: 'u-1',
        agent_id: 'a-1',
        dominant_mood: { id: 'zen', weight: 4.2, emoji: ':zen:' },
        secondary_moods: [{ id: 'supportive', weight: 2.1, emoji: ':supportive:' }],
        valence: 0.2,
        arousal: -0.1,
        trust: 0.7,
        intimacy: 0.4,
        interaction_count: 22,
        last_interaction: '2026-02-11T09:00:00+00:00',
      });
      expect(useChatStore.getState().currentMood?.dominant_mood.id).toBe('zen');

      store.setCurrentMood(null);
      expect(useChatStore.getState().currentMood).toBeNull();
    });
  });
});
