import os, joblib, pandas as pd, numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt
from werkzeug.security import generate_password_hash, check_password_hash

app=Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"]=os.getenv("DATABASE_URL","sqlite:///kisanqueue.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"]=False
app.config["JWT_SECRET_KEY"]=os.getenv("JWT_SECRET_KEY","CHANGE_ME")
db=SQLAlchemy(app); JWTManager(app); CORS(app)

BASE=os.path.join(os.path.dirname(__file__),"models")

def load(*names):
    for n in names:
        p=os.path.join(BASE,n)
        if os.path.exists(p):
            return joblib.load(p)
    raise FileNotFoundError(names)

class User(db.Model):
    id=db.Column(db.Integer,primary_key=True); name=db.Column(db.String(120))
    mobile=db.Column(db.String(20),unique=True); password=db.Column(db.String(255))
    role=db.Column(db.String(20),default="FARMER"); district=db.Column(db.String(80))
    centre_id=db.Column(db.String(30)); language=db.Column(db.String(8),default="en")

class Booking(db.Model):
    id=db.Column(db.Integer,primary_key=True); booking_id=db.Column(db.String(50),unique=True)
    user_id=db.Column(db.Integer); centre_id=db.Column(db.String(30)); district=db.Column(db.String(80))
    crop=db.Column(db.String(40)); quantity=db.Column(db.Float); date=db.Column(db.String(20))
    hour=db.Column(db.Integer); expected_wait=db.Column(db.Float); status=db.Column(db.String(20),default="BOOKED")
    checkin_time=db.Column(db.String(40)); counter_no=db.Column(db.Integer); queue_position=db.Column(db.Integer)
    serving_number=db.Column(db.Integer,default=0)


class Announcement(db.Model):
    id=db.Column(db.Integer,primary_key=True)
    title=db.Column(db.String(200),nullable=False)
    message=db.Column(db.Text,nullable=False)
    district=db.Column(db.String(80))
    crop=db.Column(db.String(40))
    priority=db.Column(db.String(20),default="NORMAL")
    created_at=db.Column(db.String(40))

with app.app_context():
    db.create_all()
    # Lightweight local SQLite migration for the new live-queue fields.
    if str(app.config["SQLALCHEMY_DATABASE_URI"]).startswith("sqlite"):
        from sqlalchemy import inspect, text
        cols={c["name"] for c in inspect(db.engine).get_columns("booking")}
        additions={"checkin_time":"VARCHAR(40)","counter_no":"INTEGER","queue_position":"INTEGER","serving_number":"INTEGER"}
        with db.engine.begin() as conn:
            for name,typ in additions.items():
                if name not in cols:
                    conn.execute(text(f"ALTER TABLE booking ADD COLUMN {name} {typ}"))

# Demo admin accounts for SIH testing.
# One admin is seeded for every Nalanda centre (C001-C040).
# These are DEMO credentials only; replace them with government-issued
# credentials before any real deployment.
NALANDA_ADMIN_ACCOUNTS = [
    {"centre_id": f"C{i:03d}", "mobile": f"90000000{i:02d}", "password": f"Admin@C{i:03d}"}
    for i in range(1, 41)
]

with app.app_context():
    # Migrate the original single SIH demo account (if it exists) into the
    # standardized C021 account so there is only one seeded admin per centre.
    legacy_mobile = "9876543210"
    c021_mobile = "9000000021"
    legacy_admin = User.query.filter_by(mobile=legacy_mobile).first()
    standardized_c021 = User.query.filter_by(mobile=c021_mobile).first()
    if legacy_admin and legacy_admin.role == "ADMIN" and legacy_admin.centre_id == "C021":
        if standardized_c021 and standardized_c021.id != legacy_admin.id:
            db.session.delete(legacy_admin)
            print("Removed legacy C021 demo admin; standardized C021 account is kept.")
        else:
            legacy_admin.mobile = c021_mobile
            legacy_admin.password = generate_password_hash("Admin@C021")
            legacy_admin.name = "Nalanda C021 Admin"
            legacy_admin.district = "Nalanda"
            legacy_admin.centre_id = "C021"
            legacy_admin.language = "en"
            print("Migrated legacy C021 demo admin to the standardized test credentials.")

    for account in NALANDA_ADMIN_ACCOUNTS:
        centre_id = account["centre_id"]
        mobile = account["mobile"]
        admin = User.query.filter_by(mobile=mobile).first()

        if admin is None:
            admin = User(
                name=f"Nalanda {centre_id} Admin",
                mobile=mobile,
                password=generate_password_hash(account["password"]),
                role="ADMIN",
                district="Nalanda",
                centre_id=centre_id,
                language="en"
            )
            db.session.add(admin)
            print(f"Demo ADMIN created: {mobile} | Password: {account['password']} | Centre: {centre_id}")
        else:
            # Keep an existing account usable for testing, but make sure it
            # is assigned to the correct Nalanda centre.
            changed = False
            if admin.role != "ADMIN":
                admin.role = "ADMIN"
                changed = True
            if admin.district != "Nalanda":
                admin.district = "Nalanda"
                changed = True
            if admin.centre_id != centre_id:
                admin.centre_id = centre_id
                changed = True
            if not admin.password:
                admin.password = generate_password_hash(account["password"])
                changed = True
            if changed:
                print(f"Demo ADMIN updated: {mobile} | Centre: {centre_id}")

    db.session.commit()
    print("Nalanda demo admins ready: C001-C040")
    print("Login format: mobile 90000000XX | password Admin@CXXX")


with app.app_context():
    # Demo GOVERNMENT account for SIH testing.
    # DEMO credentials only; replace before real deployment.
    gov_mobile = "9000000000"
    gov_password = "Gov@2026"
    gov = User.query.filter_by(mobile=gov_mobile).first()
    if gov is None:
        gov = User(
            name="Bihar Government Official",
            mobile=gov_mobile,
            password=generate_password_hash(gov_password),
            role="GOVERNMENT",
            language="en"
        )
        db.session.add(gov)
        print(f"Demo GOVERNMENT created: {gov_mobile} | Password: {gov_password}")
    else:
        gov.role = "GOVERNMENT"

    if Announcement.query.count() == 0:
        now = pd.Timestamp.now().isoformat()
        db.session.add_all([
            Announcement(
                title="Procurement Centre Monitoring",
                message="Government dashboard is monitoring queue, waiting-time and centre performance across all configured districts.",
                priority="HIGH",
                created_at=now
            ),
            Announcement(
                title="Smart Slot Recommendations",
                message="Farmers are encouraged to use recommended time slots to reduce congestion at procurement centres.",
                priority="NORMAL",
                created_at=now
            )
        ])
        print("Demo government announcements seeded.")

    db.session.commit()

@app.get("/api/health")
def health(): return {"status":"ok","service":"KisanQueue"}

@app.post("/api/auth/register")
def register():
    d=request.get_json() or {}
    if User.query.filter_by(mobile=d.get("mobile")).first(): return {"error":"Mobile already registered"},409
    u=User(name=d["name"],mobile=d["mobile"],password=generate_password_hash(d["password"]),
           role=d.get("role","FARMER").upper(),district=d.get("district"),
           centre_id=d.get("centre_id"),language=d.get("language","en"))
    db.session.add(u); db.session.commit()
    return {"message":"registered"},201

@app.post("/api/auth/login")
def login():
    d=request.get_json() or {}; u=User.query.filter_by(mobile=d.get("mobile")).first()
    if not u or not check_password_hash(u.password,d.get("password","")): return {"error":"Invalid credentials"},401
    return {"access_token":create_access_token(identity=str(u.id),additional_claims={"role":u.role}),
            "user":{"id":u.id,"name":u.name,"role":u.role,"district":u.district,"centre_id":u.centre_id,"language":u.language}}

def role(*roles):
    def deco(fn):
        from functools import wraps
        @wraps(fn)
        @jwt_required()
        def w(*a,**k):
            if get_jwt().get("role") not in roles:return {"error":"Forbidden"},403
            return fn(*a,**k)
        return w
    return deco

@app.post("/api/forecast")
def forecast():
    try:
        m=load("farmer_arrival_model.pkl","demand_forecasting_model.pkl")
        x=pd.DataFrame([request.get_json() or {}]); y=float(m.predict(x)[0])
        return {"expected_arrivals":max(0,round(y,2))}
    except Exception as e:
        print("FORECAST MODEL ERROR:", repr(e))
        return {"error":"Forecast inference failed","detail":str(e)},400

@app.post("/api/waiting-time/predict")
def waiting():
    try:
        d=request.get_json() or {}

        # The fixed model expects these exact 13 features.
        required = [
            "district",
            "centre_id",
            "crop",
            "hour",
            "day_of_week",
            "month",
            "farmers_arrived",
            "queue_before",
            "active_counters",
            "avg_processing_time_min",
            "avg_quantity_quintal",
            "staff_efficiency_index",
            "weather_delay_min",
        ]

        missing = [c for c in required if c not in d]
        if missing:
            return {
                "error": "Waiting-time input missing",
                "detail": f"Missing fields: {missing}"
            }, 400

        # Explicit column order prevents accidental input mismatch.
        x = pd.DataFrame([{
            "district": str(d["district"]),
            "centre_id": str(d["centre_id"]),
            "crop": str(d["crop"]),
            "hour": float(d["hour"]),
            "day_of_week": float(d["day_of_week"]),
            "month": float(d["month"]),
            "farmers_arrived": float(d["farmers_arrived"]),
            "queue_before": float(d["queue_before"]),
            "active_counters": float(d["active_counters"]),
            "avg_processing_time_min": float(d["avg_processing_time_min"]),
            "avg_quantity_quintal": float(d["avg_quantity_quintal"]),
            "staff_efficiency_index": float(d["staff_efficiency_index"]),
            "weather_delay_min": float(d["weather_delay_min"]),
        }], columns=required)

        # Use a distinct fixed filename first so the old incompatible pickle
        # cannot accidentally be loaded.
        m = load("wait_time_model_fixed.pkl", "wait_time_model.pkl")

        y = float(m.predict(x)[0])
        if not pd.notna(y):
            raise ValueError("Model returned a non-numeric waiting time.")

        return {
            "predicted_waiting_time_min": round(max(0.0, y), 2)
        }

    except Exception as e:
        print("WAITING MODEL ERROR:", repr(e))
        return {
            "error": "Waiting-time inference failed",
            "detail": str(e)
        }, 400

@app.post("/api/slots/recommend")
def slots():
    try:
        df=load("smart_slot_profiles.pkl","model3_slot_profiles.pkl").copy(); d=request.get_json() or {}
        q=df[(df.district==d["district"])&(df.crop==d["crop"])]
        if d.get("centre_id"): q=q[q.centre_id==d["centre_id"]]

        # Higher slot_score is better, so rank descending.
        q=q.sort_values(["slot_score","records"],ascending=[False,False]).head(int(d.get("top_n",5)))

        out=q.to_dict("records")
        for r in out:
            r["time_slot"]=f'{int(r["hour"]):02d}:00 - {int(r["hour"])+1:02d}:00'
            r["reliability"]="High" if r.get("records",0)>=10 else ("Moderate" if r.get("records",0)>=5 else "Limited")
        return {"recommendations":out}
    except Exception as e:
        print("SLOT MODEL ERROR:", repr(e))
        return {"error":"Slot recommendation failed","detail":str(e)},400

@app.post("/api/centres/recommend")
def centres():
    try:
        df = load(
            "model4_centre_profiles.pkl",
            "centre_profiles.pkl"
        ).copy()

        d = request.get_json() or {}

        district = d.get("district")
        crop = d.get("crop")
        top_n = int(d.get("top_n", 5))

        if not district or not crop:
            return {
                "error": "District and crop are required"
            }, 400

        q = df[
            (df["district"] == district) &
            (df["crop"] == crop)
        ].copy()

        if q.empty:
            return {
                "error": "No centre recommendations found"
            }, 404

        q = q.sort_values(
            "centre_score",
            ascending=False
        ).head(top_n)

        recommendations = []

        for _, row in q.iterrows():
            recommendations.append({
                "centre_id": row["centre_id"],
                "district": row["district"],
                "crop": row["crop"],
                "centre_score": round(
                    float(row["centre_score"]), 3
                ),
                "avg_waiting_time": round(
                    float(row["avg_waiting_time"]), 2
                ),
                "avg_queue": round(
                    float(row["avg_queue"]), 2
                ),
                "avg_arrivals": round(
                    float(row["avg_arrivals"]), 2
                ),
                "avg_counters": round(
                    float(row["avg_counters"]), 2
                ),
                "avg_processing_time": round(
                    float(row["avg_processing_time"]), 2
                ),
                "avg_staff_efficiency": round(
                    float(row["avg_staff_efficiency"]), 2
                ),
                "records": int(row["records"])
            })

        return {
            "district": district,
            "crop": crop,
            "recommendations": recommendations
        }

    except Exception as e:
        print("CENTRE MODEL ERROR:", repr(e))
        return {
            "error": "Centre recommendation failed",
            "detail": str(e)
        }, 400

@app.post("/api/bookings")
@role("FARMER")
def booking():
    d=request.get_json() or {}
    import uuid
    b=Booking(booking_id="KQ-"+uuid.uuid4().hex[:10].upper(),user_id=int(get_jwt()["sub"]),
      centre_id=d["centre_id"],district=d["district"],crop=d["crop"],quantity=float(d["quantity"]),
      date=d["date"],hour=int(d["hour"]),expected_wait=d.get("expected_wait"))
    db.session.add(b);db.session.commit()
    return {"booking":{c:getattr(b,c) for c in ["booking_id","centre_id","district","crop","quantity","date","hour","expected_wait","status"]}},201

@app.get("/api/bookings/my")
@role("FARMER")
def my_bookings():
    rows=Booking.query.filter_by(user_id=int(get_jwt()["sub"])).all()
    return {"bookings":[{c:getattr(b,c) for c in ["booking_id","centre_id","date","hour","crop","quantity","expected_wait","status","counter_no","queue_position"]} for b in rows]}

@app.get("/api/admin/dashboard")
@role("ADMIN")
def admin_dashboard():
    claims=get_jwt(); centre_id=claims.get("centre_id")
    if not centre_id:
        uid=int(claims["sub"]); centre_id=db.session.get(User,uid).centre_id
    today=pd.Timestamp.now().strftime("%Y-%m-%d")
    q=Booking.query.filter_by(centre_id=centre_id,date=today).all()
    active=[b for b in q if b.status in ("CHECKED_IN","PROCESSING")]
    waiting=[b for b in q if b.status in ("BOOKED","CHECKED_IN")]
    completed=[b for b in q if b.status=="COMPLETED"]
    waits=[float(b.expected_wait) for b in q if b.expected_wait is not None]
    return {"centre_id":centre_id,"date":today,"total_farmers":len(q),"farmers_waiting":len(waiting),
            "farmers_processed":len(completed),"average_waiting_time":round(sum(waits)/len(waits),2) if waits else 0,
            "current_queue":len(active),"active_counters":len({b.counter_no for b in active if b.counter_no}),
            "centre_efficiency":round((len(completed)/len(q))*100,1) if q else 0}

@app.get("/api/admin/queue")
@role("ADMIN")
def admin_queue():
    claims=get_jwt(); centre_id=claims.get("centre_id")
    if not centre_id:
        centre_id=db.session.get(User,int(claims["sub"])).centre_id
    today=pd.Timestamp.now().strftime("%Y-%m-%d")
    rows=Booking.query.filter_by(centre_id=centre_id,date=today).order_by(Booking.hour,Booking.id).all()
    out=[]
    for i,b in enumerate(rows,1):
        if b.status in ("BOOKED","CHECKED_IN","PROCESSING"): b.queue_position=i
        out.append({"booking_id":b.booking_id,"user_id":b.user_id,"centre_id":b.centre_id,"crop":b.crop,"quantity":b.quantity,
                    "date":b.date,"hour":b.hour,"expected_wait":b.expected_wait,"status":b.status,
                    "counter_no":b.counter_no,"queue_position":b.queue_position or i})
    db.session.commit()
    return {"queue":out,"centre_id":centre_id}

@app.post("/api/admin/check-in")
@role("ADMIN")
def admin_checkin():
    d=request.get_json() or {}; booking_id=d.get("booking_id")
    if not booking_id:return {"error":"booking_id is required"},400
    claims=get_jwt(); centre_id=claims.get("centre_id") or db.session.get(User,int(claims["sub"])).centre_id
    b=Booking.query.filter_by(booking_id=booking_id,centre_id=centre_id).first()
    if not b:return {"error":"Booking not found for this centre"},404
    if b.status not in ("BOOKED","CHECKED_IN"):return {"error":f"Booking is already {b.status}"},409
    # Dynamic counter assignment: choose the least-loaded counter among 1..active counters.
    active_counters=int(d.get("active_counters",3) or 3); active_counters=max(1,min(active_counters,10))
    loads=[]
    for n in range(1,active_counters+1):
        loads.append((Booking.query.filter_by(centre_id=centre_id,counter_no=n).filter(Booking.status.in_(["CHECKED_IN","PROCESSING"])).count(),n))
    counter_no=min(loads)[1]
    b.counter_no=counter_no; b.status="CHECKED_IN"; b.checkin_time=pd.Timestamp.now().isoformat()
    active=[x for x in Booking.query.filter_by(centre_id=centre_id,date=b.date).all() if x.status in ("CHECKED_IN","PROCESSING")]
    b.queue_position=len(active)+1
    db.session.commit()
    return {"message":"Farmer checked in","booking":{"booking_id":b.booking_id,"status":b.status,"counter_no":b.counter_no,"queue_position":b.queue_position,"expected_wait":b.expected_wait}},200

@app.patch("/api/admin/bookings/<booking_id>/status")
@role("ADMIN")
def admin_status(booking_id):
    d=request.get_json() or {}; status=str(d.get("status","")).upper()
    allowed={"BOOKED","CHECKED_IN","PROCESSING","COMPLETED","CANCELLED"}
    if status not in allowed:return {"error":"Invalid status"},400
    claims=get_jwt(); centre_id=claims.get("centre_id") or db.session.get(User,int(claims["sub"])).centre_id
    b=Booking.query.filter_by(booking_id=booking_id,centre_id=centre_id).first()
    if not b:return {"error":"Booking not found"},404
    b.status=status
    if "counter_no" in d and d["counter_no"] is not None:b.counter_no=int(d["counter_no"])
    db.session.commit()
    return {"message":"Status updated","booking":{"booking_id":b.booking_id,"status":b.status,"counter_no":b.counter_no,"queue_position":b.queue_position}},200

GOVERNMENT_DISTRICTS = ["Nawada","Jehanabad","Patna","Gaya","Nalanda","Sheikhpura","Jamui","Aurangabad"]
GOVERNMENT_CROPS = ["Maize","Paddy","Wheat"]

def _government_profiles():
    """Load the existing centre-profile model used by farmer recommendations."""
    return load("model4_centre_profiles.pkl", "centre_profiles.pkl").copy()

def _government_slots():
    """Load the existing slot-profile model used by smart-slot recommendations."""
    return load("smart_slot_profiles.pkl", "model3_slot_profiles.pkl").copy()

@app.get("/api/government/dashboard")
@role("GOVERNMENT")
def govt_dashboard():
    try:
        centre_df = _government_profiles()

        district_rows = []
        for district in GOVERNMENT_DISTRICTS:
            q = centre_df[centre_df["district"] == district]
            district_rows.append({
                "district": district,
                "centres": int(q["centre_id"].nunique()) if not q.empty else 0,
                "avg_waiting_time": round(float(q["avg_waiting_time"].mean()), 2) if not q.empty else 0,
                "avg_queue": round(float(q["avg_queue"].mean()), 2) if not q.empty else 0,
                "avg_arrivals": round(float(q["avg_arrivals"].mean()), 2) if not q.empty else 0,
                "avg_staff_efficiency": round(float(q["avg_staff_efficiency"].mean()), 2) if not q.empty else 0,
                "centre_score": round(float(q["centre_score"].mean()), 3) if not q.empty else 0
            })

        today = pd.Timestamp.now().strftime("%Y-%m-%d")
        bookings_today = Booking.query.filter_by(date=today).all()
        completed = sum(1 for b in bookings_today if b.status == "COMPLETED")
        active = sum(1 for b in bookings_today if b.status in ("CHECKED_IN","PROCESSING"))

        return {
            "districts": GOVERNMENT_DISTRICTS,
            "crops": GOVERNMENT_CROPS,
            "total_centres": int(centre_df["centre_id"].nunique()),
            "today": today,
            "bookings_today": len(bookings_today),
            "completed_today": completed,
            "active_queue_today": active,
            "district_overview": district_rows
        }
    except Exception as e:
        print("GOVERNMENT DASHBOARD ERROR:", repr(e))
        return {"error":"Government dashboard failed","detail":str(e)},400

@app.get("/api/government/analytics")
@role("GOVERNMENT")
def govt_analytics():
    try:
        centre_df = _government_profiles()
        slot_df = _government_slots()

        # Centre performance is directly derived from the existing centre-profile model.
        centre_performance = []
        for _, row in centre_df.sort_values("centre_score", ascending=False).iterrows():
            centre_performance.append({
                "district": row["district"],
                "centre_id": row["centre_id"],
                "crop": row["crop"],
                "centre_score": round(float(row["centre_score"]), 3),
                "avg_waiting_time": round(float(row["avg_waiting_time"]), 2),
                "avg_queue": round(float(row["avg_queue"]), 2),
                "avg_arrivals": round(float(row["avg_arrivals"]), 2),
                "avg_counters": round(float(row["avg_counters"]), 2),
                "avg_processing_time": round(float(row["avg_processing_time"]), 2),
                "avg_staff_efficiency": round(float(row["avg_staff_efficiency"]), 2),
                "records": int(row["records"])
            })

        # Crop analytics from the same historical profile data.
        crop_analytics = []
        for crop in GOVERNMENT_CROPS:
            q = centre_df[centre_df["crop"] == crop]
            crop_analytics.append({
                "crop": crop,
                "centres": int(q["centre_id"].nunique()) if not q.empty else 0,
                "avg_waiting_time": round(float(q["avg_waiting_time"].mean()), 2) if not q.empty else 0,
                "avg_queue": round(float(q["avg_queue"].mean()), 2) if not q.empty else 0,
                "avg_arrivals": round(float(q["avg_arrivals"].mean()), 2) if not q.empty else 0,
                "avg_processing_time": round(float(q["avg_processing_time"].mean()), 2) if not q.empty else 0
            })

        # Predictive/operational view: highest-demand profile slots by district and crop.
        predictive = []
        for (district, crop), q in slot_df.groupby(["district","crop"]):
            q = q.sort_values(["avg_arrivals","slot_score"], ascending=[False,False]).head(3)
            for _, row in q.iterrows():
                predictive.append({
                    "district": district,
                    "crop": crop,
                    "centre_id": row["centre_id"],
                    "hour": int(row["hour"]),
                    "time_slot": f'{int(row["hour"]):02d}:00 - {int(row["hour"])+1:02d}:00',
                    "expected_arrivals_profile": round(float(row["avg_arrivals"]), 2),
                    "avg_waiting_time": round(float(row["avg_waiting_time"]), 2),
                    "avg_queue": round(float(row["avg_queue"]), 2),
                    "slot_score": round(float(row["slot_score"]), 3),
                    "records": int(row["records"])
                })

        overloaded = [
            x for x in centre_performance
            if x["avg_waiting_time"] >= float(centre_df["avg_waiting_time"].quantile(0.75))
        ]
        overloaded = sorted(overloaded, key=lambda x: x["avg_waiting_time"], reverse=True)[:10]

        return {
            "centre_performance": centre_performance,
            "crop_analytics": crop_analytics,
            "predictions": predictive[:30],
            "overloaded_centres": overloaded,
            "model_sources": {
                "centre_profiles": "model4_centre_profiles.pkl / centre_profiles.pkl",
                "slot_profiles": "model3_slot_profiles.pkl / smart_slot_profiles.pkl"
            }
        }
    except Exception as e:
        print("GOVERNMENT ANALYTICS ERROR:", repr(e))
        return {"error":"Government analytics failed","detail":str(e)},400

@app.get("/api/government/announcements")
@role("GOVERNMENT")
def govt_announcements():
    rows = Announcement.query.order_by(Announcement.id.desc()).all()
    return {
        "announcements": [{
            "id": a.id,
            "title": a.title,
            "message": a.message,
            "district": a.district,
            "crop": a.crop,
            "priority": a.priority,
            "created_at": a.created_at
        } for a in rows]
    }

@app.post("/api/government/announcements")
@role("GOVERNMENT")
def create_government_announcement():
    d = request.get_json() or {}
    title = str(d.get("title","")).strip()
    message = str(d.get("message","")).strip()
    if not title or not message:
        return {"error":"title and message are required"},400

    a = Announcement(
        title=title,
        message=message,
        district=d.get("district"),
        crop=d.get("crop"),
        priority=str(d.get("priority","NORMAL")).upper(),
        created_at=pd.Timestamp.now().isoformat()
    )
    db.session.add(a)
    db.session.commit()

    return {
        "message":"Announcement created",
        "announcement":{
            "id":a.id,
            "title":a.title,
            "message":a.message,
            "district":a.district,
            "crop":a.crop,
            "priority":a.priority,
            "created_at":a.created_at
        }
    },201

if __name__=="__main__": app.run("0.0.0.0",5000,debug=True)
