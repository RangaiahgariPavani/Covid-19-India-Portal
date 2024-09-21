const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const path = require('path')
const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () =>
      console.log('Server Running at http://localhost:3000/'),
    )
  } catch (e) {
    console.log(`Db Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDbAndServer()

const convertStatedbObjectToResponseObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

const convertDistrictDbObjectToResponseObject = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

function authorization(request, response, next) {
  let jwtToken
  const authorHeader = request.headers['authorization']
  if (authorHeader !== undefined) {
    jwtToken = authorHeader.split(' ')[1]
  }

  if (jwtToken == undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

//Login API
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(selectUserQuery)

  if (dbUser == undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched == true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//Get all states,API
app.get('/states/', authorization, async (request, response) => {
  const getStatesQuery = `SELECT * FROM state;`
  const statesArray = await db.all(getStatesQuery)
  response.send(
    statesArray.map(eachState =>
      convertStatedbObjectToResponseObject(eachState),
    ),
  )
})

//Get state,API
app.get('/states/:stateId/', authorization, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `SELECT * FROM state WHERE state_id = ${stateId};`
  const state = await db.get(getStateQuery)
  response.send(convertStatedbObjectToResponseObject(state))
})

//Post district,API
app.post('/districts/', authorization, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const addDistrictQuery = `INSERT INTO district(district_name, state_id, cases, cured, active, deaths)
      VALUES ('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});`
  await db.run(addDistrictQuery)
  response.send('District Successfully Added')
})

//Get district,API
app.get('/districts/:districtId/', authorization, async (request, response) => {
  const {districtId} = request.params
  const getDistrictQuery = `SELECT * FROM district WHERE district_id = ${districtId};`
  const district = await db.get(getDistrictQuery)
  response.send(convertDistrictDbObjectToResponseObject(district))
})

//delete district,API
app.delete(
  '/districts/:districtId/',
  authorization,
  async (request, response) => {
    const {districtId} = request.params
    const delteDistrictQuery = `
    DELETE FROM district
    WHERE district_id = ${districtId};`
    await db.run(delteDistrictQuery)
    response.send('District Removed')
  },
)

//Put district,API
app.put('/districts/:districtId/', authorization, async (request, response) => {
  const {districtId} = request.params
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const updateDistrictQuery = `
    UPDATE district
    SET 
     district_name = '${districtName}',
     state_id = ${stateId},
     cases = ${cases},
     cured = ${cured},
     active = ${active},
     deaths = ${deaths}
    WHERE district_id = ${districtId};`
  await db.run(updateDistrictQuery)
  response.send('District Details Updated')
})

//Get states-statistics,API
app.get('/states/:stateId/stats/', authorization, async (request, response) => {
  const {stateId} = request.params
  const getStatsQuery = `
    SELECT 
      SUM(cases) AS totalCases,
      SUM(cured) AS totalCured,
      SUM(active) AS totalActive,
      SUM(deaths) AS totalDeaths
    FROM district
    WHERE state_id = ${stateId};`
  const stats = await db.get(getStatsQuery)
  response.send(stats)
})

module.exports = app
