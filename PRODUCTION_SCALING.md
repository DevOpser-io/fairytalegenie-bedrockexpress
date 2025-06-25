# Production Scaling Guide

## Current Rate Limiting

The application currently uses simple IP-based daily rate limiting:
- **Development**: 10,000 requests per IP per day
- **Key**: `story_limit:${ip}:${date}`
- **Storage**: Redis

## Scaling to Thousands of Requests/Second

### 1. Rate Limiting Improvements

**Current Issues:**
- IP-based limiting can block legitimate users behind NATs
- Daily limits don't handle burst traffic well
- Single Redis instance may become bottleneck

**Recommended Changes:**

#### Option A: User-Based Rate Limiting
```javascript
// Use authenticated user ID instead of IP
const rateLimitKey = `story_limit:user:${req.user.id}:${date}`;
```

#### Option B: Sliding Window Rate Limiting
```javascript
// Allow X requests per minute/hour instead of daily
const rateLimitKey = `story_limit:${userId}:${Math.floor(Date.now() / 60000)}`; // per minute
await expire(rateLimitKey, 60); // 1 minute TTL
```

#### Option C: AWS API Gateway Rate Limiting
- Move rate limiting to API Gateway
- Per-API-key limits
- Built-in DDoS protection

### 2. Infrastructure Scaling

#### Redis Scaling
- **Redis Cluster**: Distribute rate limit data across multiple nodes
- **Redis Elasticache**: AWS managed Redis with auto-scaling
- **Alternative**: DynamoDB with TTL for rate limit data

#### Application Scaling
- **Load Balancer**: ALB with multiple EC2/ECS instances
- **Auto Scaling**: Scale based on CPU/memory/request metrics
- **ECS Fargate**: Serverless container scaling

#### Bedrock Scaling
- **Quotas**: Ensure adequate Bedrock quotas for your region
- **Multi-Region**: Deploy across multiple regions for redundancy
- **Batch Processing**: Queue story requests during high load

### 3. Performance Optimizations

#### Caching
```javascript
// Cache common story elements
const cacheKey = `story_template:${age}:${elements.sort().join(',')}`;
const cachedStory = await get(cacheKey);
```

#### Async Processing
```javascript
// Return immediately, process asynchronously
res.status(202).json({ storyId, status: 'queued' });
// Queue story generation for background processing
```

#### Database Optimization
- Connection pooling
- Read replicas for story retrieval
- Eventual consistency for non-critical data

### 4. Monitoring & Observability

#### Metrics to Track
- Requests per second
- Response times
- Error rates
- Rate limit hit rates
- Bedrock quota usage
- Redis/DB performance

#### Tools
- **CloudWatch**: AWS native monitoring
- **Prometheus + Grafana**: Open source monitoring
- **New Relic/DataDog**: Commercial APM

### 5. Example Production Architecture

```
Internet → CloudFront → ALB → [ECS Fargate Instances] → Redis Cluster
                              ↓
                          Bedrock API
                              ↓
                          SQS → Lambda (Image Generation)
                              ↓
                            S3
```

### 6. Gradual Migration Path

1. **Phase 1**: Increase current limits (✅ Done - 10,000/day)
2. **Phase 2**: Implement user-based rate limiting
3. **Phase 3**: Add sliding window rate limiting
4. **Phase 4**: Deploy load balancer + auto scaling
5. **Phase 5**: Implement caching and async processing
6. **Phase 6**: Multi-region deployment

### 7. Cost Considerations

At thousands of requests/second:
- **Bedrock**: Major cost factor (~$0.01-0.10 per story)
- **Compute**: ECS/EC2 costs for app servers
- **Storage**: Redis/RDS costs
- **Data Transfer**: CloudFront/ALB costs

Budget approximately $0.05-0.15 per story request including all infrastructure costs.

## Immediate Next Steps

For your current development needs:
1. ✅ Rate limit increased to 10,000/day
2. Restart your server to apply changes
3. Consider user-based limiting for production

For production planning:
1. Load test with realistic traffic patterns
2. Set up monitoring and alerting
3. Plan gradual rollout with canary deployments