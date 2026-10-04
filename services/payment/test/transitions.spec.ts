import { canMoveTo, Status, STATUSES } from '../src/payment/payment';

test('разрешены ровно описанные переходы', () => {
  const allowed: [Status, Status][] = [
    ['AUTHORIZED', 'CAPTURED'],
    ['AUTHORIZED', 'REFUNDED'],
    ['AUTHORIZED', 'FAILED'],
    ['CAPTURED', 'REFUNDED'],
  ];

  for (const [from, to] of allowed) expect({ from, to, allowed: canMoveTo(from, to) }).toEqual({ from, to, allowed: true });
});

test('конечные статусы никуда не ведут, назад дороги нет', () => {
  const forbidden: [Status, Status][] = [
    ['REFUNDED', 'CAPTURED'],
    ['REFUNDED', 'AUTHORIZED'],
    ['FAILED', 'CAPTURED'],
    ['CAPTURED', 'AUTHORIZED'],
  ];

  for (const [from, to] of forbidden) expect({ from, to, allowed: canMoveTo(from, to) }).toEqual({ from, to, allowed: false });
});

test('переход в себя же не переход: повтор обрабатывается выше, а не в автомате', () => {
  for (const status of STATUSES) expect({ status, allowed: canMoveTo(status, status) }).toEqual({ status, allowed: false });
});
