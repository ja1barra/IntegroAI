// Deep links to HubSpot records, built only from verified numeric ids.
const HUBSPOT_OBJECT_TYPE = { deal: '0-3', contact: '0-1', company: '0-2' }

export function hubspotRecordUrl(portalId, objectType, externalId, host = 'app.hubspot.com') {
  const type = HUBSPOT_OBJECT_TYPE[objectType]
  if (!type || !/^\d{1,12}$/.test(String(portalId ?? '')) || !/^\d{1,20}$/.test(String(externalId ?? ''))) return null
  return `https://${host}/contacts/${portalId}/record/${type}/${externalId}`
}
