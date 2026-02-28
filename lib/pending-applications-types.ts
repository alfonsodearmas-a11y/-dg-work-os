export interface PendingApplication {
  id: string
  agency: 'GPL' | 'GWI'
  customerReference: string
  firstName: string
  lastName: string
  telephone: string
  region: string
  district: string
  villageWard: string
  street: string
  lot: string
  eventCode: string
  eventDescription: string
  applicationDate: string
  daysWaiting: number
  dataAsOf: string
}

export interface PendingApplicationStats {
  total: number
  avgDaysWaiting: number
  maxDaysWaiting: number
  longestWaitCustomer: PendingApplication | null
  byRegion: { region: string; count: number; avgDays: number; maxDays: number; over30Count: number }[]
  waitBrackets: { label: string; min: number; max: number | null; count: number }[]
  dataAsOf: string
}
