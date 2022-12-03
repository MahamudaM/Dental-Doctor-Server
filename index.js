const express = require("express");
const cors = require("cors");
const jwt= require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// const e = require("express");
require("dotenv").config();

const port = process.env.PORT || 5000;

const app = express();
// middleware
app.use(cors());
app.use(express.json());

// mongodb config

const uri = `mongodb+srv://${process.env.Db_userName}:${process.env.Db_userPassword}@cluster0.4jfewjr.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
/*
NODE : api naming convention ta mone rakte hobe
*bookings (api hesabe amra bookings ta k niye deal kobo)
*app.get('/bookings') (akhane amra sobe bookings ta k paite chai)
*app.get('/bookings/:id') [akhane je amader first name a bookings ta k use korte hobe amon na (akhane bookings thake 
specific id ola akta k  pete chache) ]

*app.post('/bookings') (mane amra bookings ar modda noton akta object ba noton akta docoment add korte chache )
*app.patch('/bookings/:id') (kono akta specific id ar data k update korte chache)
*app.delete('/bookings/:id') (bookings ar modday specific akta id k delete korte chache)
*
*/

// veryfiy jwt
function verifyJwt(req,res,next){
  console.log('my appoi token',)
  const authHader = req.headers.authorization
  if(!authHader){
    return res.status(401).send('unauthoriz acces')
  }
  const token = authHader.split(' ')[1];
  jwt.verify(token,process.env.ACCESS_TOKEN,function(error,decoded){
    if(error){
    return res.status(403).send({message:'forbiden acces'})
    }
    req.decoded = decoded;
    next();
  })
}
async function run() {
  try {
    const appoinOptionCollection = client.db("dentalDoctorDb").collection("AppointmentOption");
    const bookingCollection = client.db("dentalDoctorDb").collection("bookings");
    const userCollection = client.db("dentalDoctorDb").collection("users");
    const doctorCollection = client.db("dentalDoctorDb").collection("doctors");

    // verifyAdmin
    // note: make sure you use verifyAdmin after verifyJwt.ata korle amra decoded email ta k check korte pare
    const verifyAdmin = async(req,res,next)=>{

      console.log('inside admin',req.decoded.email)
      const decodedEmail = req.decoded.email;
      const query = {email:decodedEmail}
      const adminUser = await userCollection.findOne(query)
      if(adminUser?.role !=='admin'){
        return res.status(403).send({message:'forbiden access'})
      }
      next()
    }
    // get all appointment option
    // use aggregate to query multiple collection and then merge data
    app.get("/appiontOption", async (req, res) => {
      // appiontOpton a ja date ace sai date ta k recive korce
      const date = req.query.date;
     
      // appiontOption ar query
      const query = {};
      const options = await appoinOptionCollection.find(query).toArray();
      // get the booking of the provided date
      // booking query (bookings ar betore je appointmentDate ace seta diye query korbe ,are date ta hosscha appiontOption ar
      // a ja date ta select kore dai)
      const bookingQuery = { appointmentDate: date };
      const alreadyBooked = await bookingCollection.find(bookingQuery).toArray();
      // options ar modde foreach kore akta option k pabo and tar jonno  alreadyBooker ace ki na seta  check korbo

      // code carefully
      options.forEach((option) => {
        /* 
  akhne book hoccha modal ar booking ar ak ak te bookings jar modda treatmentName name akta propert ace and option ta hoche
 ak ak ta appionmentoption and ar modda name name akta property royece ja hocche oi treatment ar name .
 */
        const isOptonBook = alreadyBooked.filter((book) => book.treatmentName === option.name);
        // ai isoptionBook ar kon kon slote book hoice ta ber korte hobe
        const alreadyBookSlot = isOptonBook.map((singleBookSlot) => singleBookSlot.slot);
        // option ar modday joto golo slot ace prottekta slot ar jeta je ta oi alreasyBookSlot ar modday nai sagolo amak dao

        const remainingSlots =option.slots.filter(slot=>!alreadyBookSlot.includes(slot))
        option.slots = remainingSlots;
        // console.log(date, option.name, alreadyBookSlot,remainingSlots.length);
      });

      res.send(options);
    });

    // write api with version ager tai just onnorokom babe dekah, tome chaile aitao korte paro na hole oporar tao korte paro
    app.get('/v2/appiontOption',async(req,res)=>{
      const date = req.query.date;
      const options = await appoinOptionCollection.aggregate([
        {
          $looup: {
            from: 'bookings',
            localField: 'name',
            foreignField: 'treatmentName',
            pipeline: [{
              $match: {
                $expre:{
                  $eq:['$appointmentDate',date]
                }
              }
            } ,
            {
              $project:{
                treatmentName:1,
                slots : 1,
                booked:{
                  $map:{
                    input:'$booked',
                    as:'book',
                    in: '$book.slot'
                  }
                }
              }  
            },
            {
              $project:{
                treatmentName:1,
                slots : {
                  $setDiffrenc : ['$slots','$booked']
                }
               
              }  
            }
          ],
            as: 'booked'
          }
        }
      ]).toArray() 
      res.send(options)
    })

    // send all booking in mongodb database
    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      // kono akjon user ar ak ta date a kono ak ta slote a akta nerdisto treatment a koita appointment ace ta ber korte hobe
      const query = {
        // oi den a appointment paile ar appointment debe na
        appointmentDate: booking.appointmentDate,
      // at treatment thakle ar ata te appiont dibo na, oi din a 
        treatmentName:booking.treatmentName,  
        email:booking.email    
      }
      const alreadyBook = await bookingCollection.find(query).toArray()
      if(alreadyBook.length){
        const message = `you already bookin on ${booking.appointmentDate}`
        return res.send({acknowledged:false,message})
      }
      // if(alreadyBook.length>=3){
      //   const message = `you can not book more then 3 treatment in a day`
      //   return res.send({acknowledged:false,message})
      // }
      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    // get booing data by email
    app.get('/bookings',verifyJwt,async(req,res)=>{
      const email = req.query.email;
    const decodedEmail = req.decoded.email
    if(email !== decodedEmail){
      return res.status(403).send({message:'forbidden access'});
    }
      const query = {
        email:email
      }
      const myBooked = await bookingCollection.find(query).toArray();
      res.send(myBooked)
    });

    // user JWT token
    app.get('/jwt',async(req,res)=>{
      const email = req.query.email;
      const query = {
        email:email
      }
      const user = await userCollection.findOne(query)
      if(user){
        const token = jwt.sign({email},process.env.ACCESS_TOKEN,{expiresIn:'1d'})
        return res.send({accerssToken:token})
      }
  
      res.status(403).send('no token')
    })
    // backup user info
    app.post('/users',async(req,res)=>{
      const user = req.body;
      const result = await userCollection.insertOne(user)
      res.send(result)
    })
    // get all user
    app.get('/allusers',async(req,res)=>{
      const query = {}
      const users = await userCollection.find(query).toArray()
      res.send(users)
    })
    // update user
    app.put('/users/admin/:id',verifyJwt,verifyAdmin,async(req,res)=>{
      const id = req.params.id;
      const filter = {_id:ObjectId(id)};
      const options = {upsert:true}
      const updatedDoc = {
        $set:{
          role:'admin'
        }
      }
      const result =await userCollection.updateOne(filter,updatedDoc,options);
      res.send(result);
    })
    // is user admin 
    app.get('/users/admin/:email',async(req,res)=>{
      const email= req.params.email;
      const query = {email}
      const user = await userCollection.findOne(query)
      res.send({isAdmin:user?.role==="admin"})
    })

    // get appointment option for dashboard speciality option
    app.get('/dasBordAppointSpeciality',async(req,res)=>{
      const query = {}
      const result = await appoinOptionCollection.find(query).project({name:1}).toArray();
      res.send(result)
    });
    // create doctor collcection
    app.post('/doctors',verifyJwt,verifyAdmin,async(req,res)=>{
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor)
      res.send(result)
    })
    // loade all doctor in server
    app.get('/doctors',verifyJwt,verifyAdmin,async(req,res)=>{
      const query = {}
      const doctor = await doctorCollection.find(query).toArray();
      res.send(doctor)
    });
    // delete doctor
    app.delete('/doctors/:id',verifyJwt,verifyAdmin,async(req,res)=>{
      const id = req.params.id;
      const filter = {_id:ObjectId(id)}
      const result = await doctorCollection.deleteOne(filter);
      res.send(result)
    })

  } finally {
  }
}
run().catch(console.log);

app.get("/", async (req, res) => {
  res.send("dental doctor runnign");
});

app.listen(port, () => console.log(`dental doctor running port ${port}`));
