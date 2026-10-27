// Stable route builders shared by pages, search, and pins.
export const routes = {
  home: '/',
  info: '/info',
  contacts: '/info/contacts',
  lists: '/lists',
  plans: '/plans',
  calendar: '/calendar',
  story: '/story',
  wedding: '/wedding',
  settings: '/settings',
  trash: '/settings/trash',
  // The query text is passed through history.state and never written to the URL,
  // so it cannot reach server or access logs.
  search: '/search',
  profile: (memberId: string) => `/info/r/p-${memberId}`,
  record: (id: string) => `/info/r/${id}`,
  list: (id: string) => `/lists/${id}`,
  plan: (id: string) => `/plans/p/${id}`,
  /** `on` picks one day of a repeating event. */
  event: (id: string, on?: string) => `/calendar/e/${id}${on ? `?on=${on}` : ''}`,
  weddingTab: (tab: 'checklist' | 'vendors' | 'budget' | 'guests') => `/wedding?tab=${tab}`,
};
