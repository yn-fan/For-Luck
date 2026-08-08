const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};

export function onRequestGet({ request }) {
  const city = typeof request.cf?.city === "string" ? request.cf.city.trim() : "";
  const region = typeof request.cf?.region === "string" ? request.cf.region.trim() : "";
  const country =
    typeof request.cf?.country === "string" ? request.cf.country.trim() : "";

  return new Response(
    JSON.stringify({
      city,
      region,
      country,
      rawIpStored: false
    }),
    { headers: JSON_HEADERS }
  );
}
