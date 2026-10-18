import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cancel, constrain, createGesture, hold, initialPosition, move, press, release, type Gesture } from './gesture';

const bounds = { x: 0, y: 0, width: 1200, height: 800 };
const origin = { x: 400, y: 300 };
const trash = { x: 1000, y: 640, width: 150, height: 130 };
const down = (): Gesture => press(createGesture(origin), origin, 1, 0);
const rub = (): Gesture => {
  let g = hold(down(), 350);
  for (const x of [490, 400, 490, 400, 490, 400]) g = move(g, { x, y: 300 }, 1, bounds);
  return g;
};

describe('paper interaction intent', () => {
  it('short click opens details once', () => {
    const result = release(down(), origin, 1, bounds, trash);
    assert.equal(result.intent, 'open');
    assert.equal(release(result.gesture, origin, 1, bounds, trash).intent, 'none');
  });
  it('ignores another pointer and does not replace a captured pointer', () => {
    const g = down();
    assert.equal(move(g, { x: 600, y: 300 }, 2, bounds), g);
    assert.equal(press(g, origin, 2, 10), g);
    assert.equal(release(g, origin, 2, bounds, trash).gesture, g);
  });
  it('early motion becomes moving, never crumpling or clicking', () => {
    const g = hold(move(down(), { x: 500, y: 300 }, 1, bounds), 600);
    assert.equal(g.phase, 'moving');
    assert.equal(g.progress, 0);
    assert.equal(release(g, { x: 500, y: 300 }, 1, bounds, trash).intent, 'none');
  });
  it('long hold without motion is not a click', () => {
    assert.equal(hold(down(), 349).phase, 'pressing');
    assert.equal(release(hold(down(), 350), origin, 1, bounds, trash).intent, 'none');
  });
  it('a straight path can fully crumple a paper', () => {
    let g = hold(down(), 350);
    for (let x = 420; x < 1100; x += 20) g = move(g, { x, y: 300 }, 1, bounds);
    assert.equal(g.progress, 1);
    assert.equal(g.phase, 'ball-moving');
  });
  it('small deliberate back-and-forth motions produce a ball', () => {
    const g = rub();
    assert.equal(g.phase, 'ball-moving');
    assert.equal(g.progress, 1);
    assert.deepEqual(g.center, g.last);
  });
  it('small movements count, stationary events do not, and large moves count fully', () => {
    let g = hold(down(), 350);
    g = move(g, origin, 1, bounds);
    assert.equal(g.progress, 0);
    g = move(g, { x: 400.5, y: 300 }, 1, bounds);
    assert.equal(g.progress, 0.5 / 440);
    g = move(g, { x: 900, y: 300 }, 1, bounds);
    assert.equal(g.progress, 1);
  });
  it('equal path lengths give equal progress regardless of event frequency or direction', () => {
    const once = move(hold(down(), 350), { x: 620, y: 300 }, 1, bounds);
    let many = hold(down(), 350);
    for (let i = 1; i <= 220; i += 1) many = move(many, { x: 400, y: 300 + i }, 1, bounds);
    assert.equal(once.progress, 0.5);
    assert.equal(many.progress, once.progress);
  });
  it('partial crumple releases back to a readable paper in bounds', () => {
    const g = move(hold(down(), 350), { x: 490, y: 300 }, 1, bounds);
    const result = release(g, { x: 490, y: 300 }, 1, bounds, trash);
    assert.equal(result.gesture.phase, 'paper');
    assert.equal(result.gesture.progress, 0);
    assert.equal(result.intent, 'none');
  });
  it('only a ball released inside the bin produces discard', () => {
    const point = { x: 1070, y: 700 };
    const g = move(rub(), point, 1, bounds);
    assert.equal(release(g, point, 1, bounds, trash).intent, 'discard');
    assert.equal(release(g, origin, 1, bounds, trash).intent, 'none');
    assert.equal(release(g, point, 1, bounds, null).intent, 'none');
    assert.equal(release(move(down(), point, 1, bounds), point, 1, bounds, trash).intent, 'none');
  });
  it('cancelling inside the bin preserves the ball without a discard', () => {
    const g = cancel(move(rub(), { x: 1070, y: 700 }, 1, bounds), bounds);
    assert.equal(g.phase, 'ball');
    assert.equal(g.pointer, null);
    assert.equal(release(g, { x: 1070, y: 700 }, 1, bounds, trash).intent, 'none');
  });
  it('clicking a parked ball unfolds it', () => {
    const g = cancel(rub(), bounds);
    assert.equal(release(press(g, g.center, 1, 1000), g.center, 1, bounds, trash).intent, 'unfold');
  });
  it('small workspaces and negative coordinates yield finite bounded centers', () => {
    assert.deepEqual(constrain(origin, 0, { x: -200, y: -50, width: 100, height: 80 }), { x: -150, y: -10 });
    assert.deepEqual(constrain({ x: -2000, y: -2000 }, 1, { x: -1200, y: 0, width: 1200, height: 800 }), { x: -1157, y: 43 });
  });
  it('three initial papers do not overlap in a 800 by 600 workspace', () => {
    const area = { x: 0, y: 0, width: 800, height: 600 };
    const positions = [0, 1, 2].map((index) => initialPosition(index, 3, area));
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        assert.ok(Math.abs(positions[i].x - positions[j].x) >= 304 || Math.abs(positions[i].y - positions[j].y) >= 220);
      }
    }
  });
  it('grabbing an existing ball preserves the off-center grip', () => {
    const g = cancel(rub(), bounds);
    const point = { x: g.center.x + 15, y: g.center.y };
    const moved = move(press(g, point, 1, 1000), { x: point.x + 40, y: point.y }, 1, bounds);
    assert.equal(moved.center.x, g.center.x + 40);
  });
});

