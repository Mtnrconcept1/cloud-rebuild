export const tokConnectOpenApiDocument = `openapi: 3.1.1
info:
  title: TOK Connect API
  version: 1.0.0
servers:
  - url: https://www.thetok.ch/functions/v1/tok-connect-api
security:
  - bearerAuth: []
paths:
  /v1/restaurants:
    get:
      summary: List active restaurants
      security:
        - bearerAuth: [restaurants:read]
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
        - name: cursor
          in: query
          schema:
            type: string
      responses:
        "200":
          description: Paginated restaurant list
  /v1/restaurants/{id}:
    get:
      summary: Read one restaurant
      security:
        - bearerAuth: [restaurants:read]
  /v1/restaurants/{id}/menu:
    get:
      summary: Read restaurant menu
      security:
        - bearerAuth: [restaurants:read]
  /v1/restaurants/{id}/availability:
    get:
      summary: Read real-time availability
      security:
        - bearerAuth: [availability:read]
  /v1/reservations/preview:
    post:
      summary: Prepare a reservation without mutation
      security:
        - bearerAuth: [reservations:create]
  /v1/reservations:
    post:
      summary: Create a confirmed idempotent reservation
      security:
        - bearerAuth: [reservations:create]
      parameters:
        - name: Idempotency-Key
          in: header
          required: true
          schema:
            type: string
  /v1/reservations/{id}/cancel/preview:
    post:
      summary: Preview cancellation without mutation
      security:
        - bearerAuth: [reservations:cancel]
  /v1/credits/balance:
    get:
      summary: Read partner credit balance
      security:
        - bearerAuth: [credits:read]
  /v1/campaigns/preview:
    post:
      summary: Generate a human-approved campaign preview
      security:
        - bearerAuth: [campaigns:preview]
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: opaque`;
