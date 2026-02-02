import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './chatStore';

describe('chatStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useChatStore.setState({
      messages: [],
      streamingContent: '',
    });
  });

  describe('addMessage', () => {
    it('should add a user message', () => {
      const store = useChatStore.getState();
      const id = store.addMessage('user', 'Hello world');

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello world');
      expect(messages[0].id).toBe(id);
    });

    it('should add an assistant message', () => {
      const store = useChatStore.getState();
      store.addMessage('assistant', 'Hello there!');

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toBe('Hello there!');
    });

    it('should add message with metadata', () => {
      const store = useChatStore.getState();
      const meta = { processing_ms: 100, model: 'gpt-4' };
      store.addMessage('assistant', 'Response', meta);

      const messages = useChatStore.getState().messages;
      expect(messages[0].meta.processing_ms).toBe(100);
      expect(messages[0].meta.model).toBe('gpt-4');
    });

    it('should return unique IDs for each message', () => {
      const store = useChatStore.getState();
      const id1 = store.addMessage('user', 'First');
      const id2 = store.addMessage('user', 'Second');

      expect(id1).not.toBe(id2);
    });

    it('should add messages in order', () => {
      const store = useChatStore.getState();
      store.addMessage('user', 'First');
      store.addMessage('assistant', 'Second');
      store.addMessage('user', 'Third');

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
      expect(messages[2].content).toBe('Third');
    });
  });

  describe('updateMessage', () => {
    it('should update message content', () => {
      const store = useChatStore.getState();
      const id = store.addMessage('user', 'Original');

      store.updateMessage(id, { content: 'Updated' });

      const messages = useChatStore.getState().messages;
      expect(messages[0].content).toBe('Updated');
    });

    it('should update message metadata', () => {
      const store = useChatStore.getState();
      const id = store.addMessage('assistant', 'Response');

      store.updateMessage(id, {
        meta: { processing_ms: 500, error: false },
      });

      const messages = useChatStore.getState().messages;
      expect(messages[0].meta.processing_ms).toBe(500);
      expect(messages[0].meta.error).toBe(false);
    });

    it('should not affect other messages', () => {
      const store = useChatStore.getState();
      const id1 = store.addMessage('user', 'First');
      store.addMessage('user', 'Second');

      store.updateMessage(id1, { content: 'Updated First' });

      const messages = useChatStore.getState().messages;
      expect(messages[0].content).toBe('Updated First');
      expect(messages[1].content).toBe('Second');
    });

    it('should handle updates to non-existent messages gracefully', () => {
      const store = useChatStore.getState();
      store.addMessage('user', 'Message');

      // Update non-existent message shouldn't crash
      store.updateMessage(999999, { content: 'New' });

      const messages = useChatStore.getState().messages;
      expect(messages[0].content).toBe('Message');
    });
  });

  describe('setMessages', () => {
    it('should replace all messages', () => {
      const store = useChatStore.getState();
      store.addMessage('user', 'Old 1');
      store.addMessage('user', 'Old 2');

      const newMessages = [
        {
          id: 1,
          role: 'user' as const,
          content: 'New 1',
          timestamp: new Date(),
          meta: {},
        },
        {
          id: 2,
          role: 'assistant' as const,
          content: 'New 2',
          timestamp: new Date(),
          meta: {},
        },
      ];

      store.setMessages(newMessages);

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('New 1');
      expect(messages[1].content).toBe('New 2');
    });

    it('should clear messages with empty array', () => {
      const store = useChatStore.getState();
      store.addMessage('user', 'Message');

      store.setMessages([]);

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(0);
    });
  });

  describe('clearMessages', () => {
    it('should remove all messages', () => {
      const store = useChatStore.getState();
      store.addMessage('user', 'First');
      store.addMessage('assistant', 'Second');
      store.addMessage('user', 'Third');

      store.clearMessages();

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(0);
    });

    it('should work when already empty', () => {
      const store = useChatStore.getState();
      store.clearMessages();

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(0);
    });
  });

  describe('streamingContent', () => {
    it('should set streaming content', () => {
      const store = useChatStore.getState();
      store.setStreamingContent('Partial response...');

      expect(useChatStore.getState().streamingContent).toBe('Partial response...');
    });

    it('should update streaming content', () => {
      const store = useChatStore.getState();
      store.setStreamingContent('Partial');
      store.setStreamingContent('Partial response');

      expect(useChatStore.getState().streamingContent).toBe('Partial response');
    });

    it('should clear streaming content', () => {
      const store = useChatStore.getState();
      store.setStreamingContent('Content');
      store.setStreamingContent('');

      expect(useChatStore.getState().streamingContent).toBe('');
    });
  });
});
