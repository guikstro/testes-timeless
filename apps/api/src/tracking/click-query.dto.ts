/**
 * Deliberately a plain interface, not a class-validator DTO: this is read
 * from the query string of a public redirect hit by ad platforms and
 * hand-crafted links we don't control, which routinely carry extra unknown
 * parameters. A validated DTO under the app's global
 * `forbidNonWhitelisted: true` pipe would 400 on exactly the traffic this
 * endpoint exists to capture, so known fields are picked out manually
 * instead — see TrackingService.recordClick.
 */
export interface ClickQuery {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  ctwa_clid?: string;
  gclid?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
}
