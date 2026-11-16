"""Synthetic PaisaPal customers. Every person, number and ID here is made up.

Aadhaar-, PAN- and UPI-shaped values are generated so the PII detectors have
something realistic to find; none of them belongs to a real person.
"""
import random

FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Ananya", "Vikram", "Isha",
         "Arjun", "Saanvi", "Nikhil", "Tara"]
LAST = ["Sharma", "Iyer", "Reddy", "Nair", "Gupta", "Menon", "Rao", "Kulkarni",
        "Bose", "Pillai", "Joshi", "Das"]
MERCHANTS = ["Swiggy", "Zomato", "BigBasket", "Namma Metro", "BESCOM", "Airtel",
             "Zepto", "BookMyShow", "Uber", "Rapido", "Myntra", "Cult.fit",
             "Chaayos", "Blinkit", "IRCTC"]


def build(seed: int = 7):
    rng = random.Random(seed)
    customers, txns = [], []
    for i in range(12):
        cid = f"C-{1001 + i}"
        first, last = FIRST[i], LAST[i]
        aadhaar = f"{rng.randint(2, 9)}{rng.randint(100, 999)} {rng.randint(1000, 9999)} {rng.randint(1000, 9999)}"
        pan = "".join(rng.choice("ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(5)) \
            + f"{rng.randint(1000, 9999)}" + rng.choice("ABCDEFGHJKLMNPQRSTUVWXYZ")
        customers.append({
            "id": cid, "name": f"{first} {last}",
            "phone": f"+91 9{rng.randint(100000000, 999999999)}",
            "upi": f"{first.lower()}.{last.lower()}@okpaisapal",
            "aadhaar": aadhaar, "pan": pan,
            "balance": rng.randint(800, 96000),
        })
    n = 0
    for c in customers:
        for _ in range(rng.randint(4, 7)):
            n += 1
            txns.append({
                "id": f"T-{5000 + n}", "account_id": c["id"],
                "merchant": rng.choice(MERCHANTS),
                "amount": rng.choice([49, 99, 149, 230, 349, 499, 640, 899, 1299, 2450, 4999]),
                "note": "", "status": "settled",
            })
    return customers, txns
