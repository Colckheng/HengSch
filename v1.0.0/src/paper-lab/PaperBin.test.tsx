import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaperBin } from './PaperBin';

describe('paper bin presentation', () => {
  it('identifies the visible target as a paper wastebasket', () => {
    const html = renderToStaticMarkup(<PaperBin visible hot={false} rect={{ x: 0, y: 0, width: 176, height: 184 }} />);
    assert.match(html, /role="img"/);
    assert.match(html, /aria-label="折纸纸篓：将纸团拖到这里关闭本次提醒"/);
  });
});
