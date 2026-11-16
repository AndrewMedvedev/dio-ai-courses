/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHAT_PANEL_HANDLE_WIDTH,
  clampChatPanelWidth,
  getChatPanelMaxWidth,
} from './panel-width';

void test('maximized drag keeps the whole handle inside a viewport with a scrollbar', () => {
  const viewport = 1416; // Окно 1440 px с обычным скроллбаром 24 px.
  const width = clampChatPanelWidth(1440, viewport);
  const handleLeft = viewport - width - CHAT_PANEL_HANDLE_WIDTH;
  assert.equal(width, getChatPanelMaxWidth(viewport));
  assert.ok(handleLeft >= 8);
  assert.ok(handleLeft + CHAT_PANEL_HANDLE_WIDTH <= viewport);
  assert.equal(clampChatPanelWidth(700, viewport), 700);
});

void test('panel width remains bounded when resizing the browser or using the keyboard', () => {
  assert.equal(clampChatPanelWidth(200, 1440), 360);
  assert.equal(clampChatPanelWidth(1400, 1025), 1005);
  assert.equal(clampChatPanelWidth(1440, 1440), 1420);
});
