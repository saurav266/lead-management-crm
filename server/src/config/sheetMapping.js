// Column <-> field mapping between the source spreadsheet/Google Sheet and
// the `leads` table. Matches the Facebook/Meta Lead Ads export format:
// created_time, ad_name, adset_name, campaign_name, platform, email,
// full_name, phone_number, city.
//
// `header` is the expected column header text in row 1 (matched
// case-insensitively, trimmed). If your export uses different header text,
// just change the strings below -- no other code needs to change.
//
// `direction`:
//   - "import":    sheet/file -> CRM only. The CRM never writes to these
//                  columns, so a Sheets write-back never overwrites them.
//   - "writeback": CRM -> sheet. Admin/employee edits in the CRM are pushed
//                  back to this column. If the column already has a value
//                  when a row is first imported, that value is imported too.
//
// `ad_name`, `adset_name`, `campaign_name`, and `platform` are each stored as
// their own column (for the dashboard's "leads by campaign/ad set/ad" charts)
// and also combined into `lead_source`, a single readable string, at import
// time (see composeLeadSource() in services/syncService.js) for the compact
// "Source" column in the leads table.
export const SHEET_COLUMNS = [
  { header: 'Key', field: 'unique_key', direction: 'import' },
  { header: 'full_name', field: 'name', direction: 'import' },
  { header: 'phone_number', field: 'mob', direction: 'import' },
  { header: 'email', field: 'email', direction: 'import' },
  { header: 'city', field: 'city', direction: 'import' },
  { header: 'created_time', field: 'date', direction: 'import' },
  { header: 'platform', field: 'platform', direction: 'import' },
  { header: 'campaign_name', field: 'campaign_name', direction: 'import' },
  { header: 'adset_name', field: 'adset_name', direction: 'import' },
  { header: 'ad_name', field: 'ad_name', direction: 'import' },
  { header: 'Interested In', field: 'interested_in', direction: 'import' },
  { header: 'Assigned', field: 'assigned_display', direction: 'writeback' },
  { header: 'Previously Assigned', field: 'previous_assigned_display', direction: 'import' },
  { header: 'Status', field: 'status', direction: 'writeback' },
  { header: 'Priority', field: 'priority', direction: 'writeback' },
  { header: 'Notes', field: 'notes', direction: 'writeback' },
  { header: 'Last Contacted', field: 'last_contacted', direction: 'writeback' },
  { header: 'Next Follow-Up', field: 'next_follow_up', direction: 'writeback' },
];

export const KEY_FIELD = 'unique_key';

export const IMPORT_FIELDS = SHEET_COLUMNS.filter((c) => c.direction === 'import').map((c) => c.field);
export const WRITEBACK_FIELDS = SHEET_COLUMNS.filter((c) => c.direction === 'writeback').map((c) => c.field);

// "Interested In" isn't in this list -- real spreadsheets use that column
// for plot/scheme names specific to the business ("Aakar Gap" etc.), which
// don't fit a short closed enum, so it's stored as free text instead.
export const LEAD_ENUMS = {
  status: ['Won', 'Lost', 'Not answered', 'Contacted', 'Broker'],
  priority: ['P1', 'P2', 'P3', 'P5'],
};

// Fields an employee is allowed to edit on their own assigned leads.
// Rejecting a lead (giving it up so the admin can reassign it) goes through
// the dedicated POST /leads/:id/reject endpoint instead of this list --
// employees can't set assigned_user_id to anything via the generic update.
export const EMPLOYEE_EDITABLE_FIELDS = ['status', 'priority', 'notes', 'last_contacted', 'next_follow_up'];

// Fields the admin may edit directly (everything except identity/system columns).
export const ADMIN_EDITABLE_FIELDS = [
  'name',
  'mob',
  'email',
  'city',
  'date',
  'assigned_user_id',
  'status',
  'priority',
  'notes',
  'last_contacted',
  'next_follow_up',
  'interested_in',
];
