// Stable route builders shared by pages, search, and pins.
export const routes = {
  home: '/',
  info: '/info',
  contacts: '/info/contacts',
  lists: '/lists',
  plans: '/plans',
  settings: '/settings',
  // The query text is passed through history.state and never written to the URL,
  // so it cannot reach server or access logs.
  search: '/search',
  profile: (memberId: string) => `/info/r/p-${memberId}`,
  record: (id: string) => `/info/r/${id}`,
  list: (id: string) => `/lists/${id}`,
  plan: (id: string) => `/plans/p/${id}`,
};
