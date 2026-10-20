/**
 * Side-effect module: wires Sequelize associations between models.
 * Import it once at startup (see server.ts). Models themselves are imported
 * directly from their own files; this barrel only re-exports `sequelize`.
 */
import sequelize from '../config/sequelize'

import User from './User'
import Credential from './Credential'
import EvidenceUrl from './EvidenceUrl'
import GithubScan from './GithubScan'
import PeerReview from './PeerReview'
import ExpertReview from './ExpertReview'
import TrustScoreHistory from './TrustScoreHistory'

User.hasMany(Credential, { foreignKey: 'developerId', as: 'credentials' })
Credential.belongsTo(User, { foreignKey: 'developerId', as: 'developer' })

Credential.hasMany(EvidenceUrl, { foreignKey: 'credentialId', as: 'evidenceUrls' })
EvidenceUrl.belongsTo(Credential, { foreignKey: 'credentialId', as: 'credential' })

Credential.hasMany(GithubScan, { foreignKey: 'credentialId', as: 'githubScans' })
GithubScan.belongsTo(Credential, { foreignKey: 'credentialId', as: 'credential' })

Credential.hasMany(PeerReview, { foreignKey: 'credentialId', as: 'peerReviews' })
PeerReview.belongsTo(Credential, { foreignKey: 'credentialId', as: 'credential' })

User.hasMany(PeerReview, { foreignKey: 'reviewerId', as: 'peerReviewsGiven' })
PeerReview.belongsTo(User, { foreignKey: 'reviewerId', as: 'reviewer' })

Credential.hasMany(ExpertReview, { foreignKey: 'credentialId', as: 'expertReviews' })
ExpertReview.belongsTo(Credential, { foreignKey: 'credentialId', as: 'credential' })

User.hasMany(ExpertReview, { foreignKey: 'expertId', as: 'expertReviewsGiven' })
ExpertReview.belongsTo(User, { foreignKey: 'expertId', as: 'expert' })

Credential.hasMany(TrustScoreHistory, { foreignKey: 'credentialId', as: 'trustScoreHistory' })
TrustScoreHistory.belongsTo(Credential, { foreignKey: 'credentialId', as: 'credential' })

export { sequelize }
