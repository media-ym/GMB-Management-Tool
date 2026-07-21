const key = process.env.GOOGLE_API_KEY;
const placeId = "ChIJP1-ZMdS55zsRveDNeVrCj08";
const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
  headers: {
    "X-Goog-Api-Key": key,
    "X-Goog-FieldMask": "*",
  },
});
const j = await r.json();
const text = JSON.stringify(j);
console.log("status", r.status, "len", text.length);
console.log("has fender", /fender/i.test(text), "has product", /product/i.test(text));
console.log(text.slice(0, 1500));
