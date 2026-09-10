

import React from 'react'
import { useNavigate } from 'react-router-dom'


const Unauthorized = () => {
  const navigate = useNavigate()

  const handleGoBack = () => {
    navigate(-1)
  }
  return (

    <section className='unauthorized'>

        <h1 className='unauthorized-heading'>UNAUTHORIZED!</h1>
        <p>You not authorized to access this page</p>
        <button onClick={handleGoBack}>
          Go Back
        </button>
    </section>
    
  )
}

export default Unauthorized