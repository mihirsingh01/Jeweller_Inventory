import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categorizeReminder,
  computeRemindersSummary,
} from '../lib/calculations/reminder-calculations.ts';

test('Reminders - Categorizes overdue reminder correctly (Req 5)', () => {
  const result = categorizeReminder('2026-09-20', 'PENDING', '2026-10-01');

  assert.equal(result.category, 'OVERDUE');
  assert.equal(result.daysDiff, 11);
  assert.equal(result.label, 'Overdue by 11 days');
  assert.equal(result.badgeColor.text, '#991B1B');
});

test('Reminders - Categorizes due today reminder correctly (Req 5)', () => {
  const result = categorizeReminder('2026-10-01', 'PENDING', '2026-10-01');

  assert.equal(result.category, 'TODAY');
  assert.equal(result.daysDiff, 0);
  assert.equal(result.label, 'Due Today');
  assert.equal(result.badgeColor.text, '#92400E');
});

test('Reminders - Categorizes upcoming reminder correctly (Req 5)', () => {
  const result = categorizeReminder('2026-10-05', 'PENDING', '2026-10-01');

  assert.equal(result.category, 'UPCOMING');
  assert.equal(result.daysDiff, -4);
  assert.equal(result.label, 'Due in 4 days');
  assert.equal(result.badgeColor.text, '#1E40AF');
});

test('Reminders - Completed and Cancelled statuses take precedence over date (Req 5, 14, 24)', () => {
  const settled = categorizeReminder('2026-08-01', 'COMPLETED', '2026-10-01');
  assert.equal(settled.category, 'COMPLETED');
  assert.equal(settled.label, 'Settled / Done');

  const cancelled = categorizeReminder('2026-08-01', 'CANCELLED', '2026-10-01');
  assert.equal(cancelled.category, 'CANCELLED');
  assert.equal(cancelled.label, 'Cancelled');

  const dismissed = categorizeReminder('2026-08-01', 'DISMISSED', '2026-10-01');
  assert.equal(dismissed.category, 'DISMISSED');
  assert.equal(dismissed.label, 'Dismissed');
});

test('Reminders - computeRemindersSummary aggregates categories with integer paise precision', () => {
  const sample = [
    { reminder_date: '2026-09-20', status: 'PENDING', amount: 50000.33 },
    { reminder_date: '2026-09-25', status: 'SENT', amount: 25000.67 },
    { reminder_date: '2026-10-01', status: 'PENDING', amount: 15000.0 },
    { reminder_date: '2026-10-07', status: 'PENDING', amount: 35000.5 },
    { reminder_date: '2026-08-10', status: 'COMPLETED', amount: 75000.0 },
    { reminder_date: '2026-09-01', status: 'CANCELLED', amount: 10000.0 },
  ];

  const summary = computeRemindersSummary(sample, '2026-10-01');

  assert.equal(summary.overdueCount, 2);
  assert.equal(summary.overdueAmount, 75001.0); // 50000.33 + 25000.67

  assert.equal(summary.todayCount, 1);
  assert.equal(summary.todayAmount, 15000.0);

  assert.equal(summary.upcomingCount, 1);
  assert.equal(summary.upcomingAmount, 35000.5);

  assert.equal(summary.completedCount, 1);
  assert.equal(summary.completedAmount, 75000.0);

  assert.equal(summary.totalActiveCount, 4); // 2 overdue + 1 today + 1 upcoming
});
