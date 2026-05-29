// Test the doctors endpoint
const res = await fetch("http://localhost:3000/api/medications");
console.log("Medications status:", res.status);
const data = await res.json();
console.log("Medications:", JSON.stringify(data, null, 2).slice(0, 500));
