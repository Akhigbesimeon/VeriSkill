import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import api from '@/lib/api'
import styles from './NewCredentialPage.module.css'

const SKILLS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Kotlin', 'Swift',
  'Go', 'Rust', 'C', 'C#', 'PHP', 'Ruby', 'Solidity',
  'HTML', 'CSS', 'SQL',
  'React', 'Node.js', 'Git', 'Docker',
  'Kubernetes', 'AWS', 'Terraform',
] as const

export function NewCredentialPage() {
  const [skill, setSkill]   = useState<string>('')
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!skill) { setError('Please select a skill.'); return }
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.post<{ id: string }>('/credentials', { skill })
      navigate(`/credentials/${data.id}`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg ?? 'Failed to create credential. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Step 1 of 2</span>
        <h1 className={styles.title}>Add a credential</h1>
        <p className={styles.sub}>Pick the skill you want to verify. You&rsquo;ll attach evidence next.</p>
      </header>

      <Card className={styles.card}>
        <CardHeader>
          <span className={styles.cardTitle}>Select skill</span>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} noValidate className={styles.form}>
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Approved skills for the MVP pilot</legend>
              <div className={styles.grid}>
                {SKILLS.map(s => (
                  <label key={s} className={[styles.skillCard, skill === s ? styles.skillSelected : ''].join(' ')}>
                    <input
                      type="radio"
                      name="skill"
                      value={s}
                      checked={skill === s}
                      onChange={() => setSkill(s)}
                      className="sr-only"
                    />
                    <span className={styles.skillName}>{s}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {error && <p className={styles.error} role="alert">{error}</p>}

            <div className={styles.actions}>
              <Button type="submit" loading={loading} disabled={!skill}>
                Create Credential
              </Button>
              <Button type="button" variant="secondary" onClick={() => navigate('/credentials')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
