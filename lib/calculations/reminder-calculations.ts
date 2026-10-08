/**
 * Pure zero-float calculation and categorization logic for Payment Reminders (Req 5, 14, 24).
 */

export type ReminderCategory =
  | 'OVERDUE'
  | 'TODAY'
  | 'UPCOMING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISMISSED';

export interface CategorizedReminderResult {
  category: ReminderCategory;
  daysDiff: number; // Positive if overdue, 0 if today, negative if upcoming
  label: string;
  badgeColor: {
    bg: string;
    text: string;
    border: string;
  };
}

export function categorizeReminder(
  reminderDateStr: string,
  status: string,
  todayStr?: string,
): CategorizedReminderResult {
  if (status === 'COMPLETED') {
    return {
      category: 'COMPLETED',
      daysDiff: 0,
      label: 'Settled / Done',
      badgeColor: { bg: '#DEF7EC', text: '#03543F', border: '#BCF0DA' },
    };
  }

  if (status === 'CANCELLED') {
    return {
      category: 'CANCELLED',
      daysDiff: 0,
      label: 'Cancelled',
      badgeColor: { bg: '#F3F4F6', text: '#6B7280', border: '#E5E7EB' },
    };
  }

  if (status === 'DISMISSED') {
    return {
      category: 'DISMISSED',
      daysDiff: 0,
      label: 'Dismissed',
      badgeColor: { bg: '#F3F4F6', text: '#4B5563', border: '#D1D5DB' },
    };
  }

  const effectiveToday = todayStr || new Date().toISOString().split('T')[0];
  const reminderTime = new Date(reminderDateStr).setHours(0, 0, 0, 0);
  const todayTime = new Date(effectiveToday).setHours(0, 0, 0, 0);

  const diffMs = todayTime - reminderTime;
  const daysDiff = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (daysDiff > 0) {
    return {
      category: 'OVERDUE',
      daysDiff,
      label: daysDiff === 1 ? 'Overdue by 1 day' : `Overdue by ${daysDiff} days`,
      badgeColor: { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
    };
  } else if (daysDiff === 0) {
    return {
      category: 'TODAY',
      daysDiff: 0,
      label: 'Due Today',
      badgeColor: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
    };
  } else {
    const upcomingDays = Math.abs(daysDiff);
    return {
      category: 'UPCOMING',
      daysDiff,
      label: upcomingDays === 1 ? 'Due tomorrow' : `Due in ${upcomingDays} days`,
      badgeColor: { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' },
    };
  }
}

export interface RemindersSummary {
  overdueCount: number;
  overdueAmount: number;
  todayCount: number;
  todayAmount: number;
  upcomingCount: number;
  upcomingAmount: number;
  completedCount: number;
  completedAmount: number;
  totalActiveCount: number;
}

export function computeRemindersSummary(
  reminders: Array<{ reminder_date: string; status: string; amount: number }>,
  todayStr?: string,
): RemindersSummary {
  let overdueCount = 0;
  let overduePaise = 0;
  let todayCount = 0;
  let todayPaise = 0;
  let upcomingCount = 0;
  let upcomingPaise = 0;
  let completedCount = 0;
  let completedPaise = 0;

  for (const r of reminders) {
    const amountPaise = Math.round(Number(r.amount || 0) * 100);
    const cat = categorizeReminder(r.reminder_date, r.status, todayStr);

    switch (cat.category) {
      case 'OVERDUE':
        overdueCount++;
        overduePaise += amountPaise;
        break;
      case 'TODAY':
        todayCount++;
        todayPaise += amountPaise;
        break;
      case 'UPCOMING':
        upcomingCount++;
        upcomingPaise += amountPaise;
        break;
      case 'COMPLETED':
        completedCount++;
        completedPaise += amountPaise;
        break;
    }
  }

  return {
    overdueCount,
    overdueAmount: overduePaise / 100,
    todayCount,
    todayAmount: todayPaise / 100,
    upcomingCount,
    upcomingAmount: upcomingPaise / 100,
    completedCount,
    completedAmount: completedPaise / 100,
    totalActiveCount: overdueCount + todayCount + upcomingCount,
  };
}
