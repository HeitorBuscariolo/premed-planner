const CALENDAR_EVENTS_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';

async function callCalendarApi(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body?.error?.message || `Google Calendar request failed: ${res.status}`,
    );
  }
  return res.json();
}

export async function upsertCalendarEvent(
  accessToken,
  existingEventId,
  { summary, startDate, endDate },
) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  const body = JSON.stringify({
    summary,
    start: { date: startDate },
    end: { date: endDate },
  });

  if (existingEventId) {
    try {
      return await callCalendarApi(`${CALENDAR_EVENTS_URL}/${existingEventId}`, {
        method: 'PATCH',
        headers,
        body,
      });
    } catch {
      // The event may have been deleted on the Google side — fall through
      // and create a fresh one instead of failing the whole sync.
    }
  }

  return callCalendarApi(CALENDAR_EVENTS_URL, { method: 'POST', headers, body });
}
