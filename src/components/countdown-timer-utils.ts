export function getTargetFromMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function getTargetFromPickup(date: string, time: string): Date {
  return new Date(`${date}T${time}`);
}
