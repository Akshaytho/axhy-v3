/**
 * Text input + Send button for the chat tab.
 * iOS keyboard's built-in dictation mic is automatic for any TextInput;
 * no custom voice button in Wave 4a (Wave 4b adds Sarvam/Whisper).
 *
 * Uses the terracotta+paper token system (panel-locked 2026-05-07).
 *
 * @derives(master-plan §G)
 */

import { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { tokens } from '@axhy/ui-tokens';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
};

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  const sendDisabled = !text.trim() || !!disabled;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={s.row}>
        <TextInput
          style={s.input}
          placeholder="Type or 🎤 dictate..."
          placeholderTextColor={tokens.color.ink.placeholder}
          value={text}
          onChangeText={setText}
          multiline={false}
          returnKeyType="send"
          onSubmitEditing={send}
          editable={!disabled}
        />
        <Pressable
          style={[s.sendBtn, sendDisabled && s.sendBtnDisabled]}
          onPress={send}
          disabled={sendDisabled}
        >
          <Text style={s.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: tokens.space[2],
    padding: tokens.space[3],
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper,
  },
  input: {
    flex: 1,
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r4,
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[2] + 2, // 10
    color: tokens.color.ink.primary,
    fontSize: tokens.type.body.size,
  },
  sendBtn: {
    paddingVertical: tokens.space[2] + 2, // 10
    paddingHorizontal: tokens.space[4] + 2, // 18
    borderRadius: tokens.radius.r4,
    backgroundColor: tokens.color.brand.accent,
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: {
    color: tokens.color.surface.paper,
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.bold) as '700',
  },
});
