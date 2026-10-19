

import { useNavigate } from 'react-router-dom'


const Unauthorized = () => {
  const navigate = useNavigate()

  const handleGoBack = () => {
    navigate(-1)
  }
  return (

    <section className='unauthorized' lang="id">

        <h1 className='unauthorized-heading'>AKSES DITOLAK</h1>
        <p>Anda tidak memiliki akses ke halaman ini.</p>
        <button onClick={handleGoBack}>
          Kembali
        </button>
    </section>

  )
}

export default Unauthorized
