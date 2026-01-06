export enum Priority {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  NOISE = 'NOISE',
}

export const PriorityConfig = {
  [Priority.HIGH]: {
    label: 'Alta',
    daysToComplete: 1,
    color: '#EF4444',
  },
  [Priority.MEDIUM]: {
    label: 'Media',
    daysToComplete: 2,
    color: '#F59E0B',
  },
  [Priority.LOW]: {
    label: 'Baja',
    daysToComplete: 5,
    color: '#6B7280',
  },
  [Priority.NOISE]: {
    label: 'Ruido',
    daysToComplete: null,
    color: '#8B5CF6',
  },
};
