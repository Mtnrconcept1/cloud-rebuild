export const tokConnectOpenApiDocument = `openapi: 3.1.1
info:
  title: TOK Connect API
  version: 1.0.0
  summary: API REST, OAuth scoped, webhooks and MCP-safe reservation commerce for TOK partners.
  description: |
    TOK Connect v1 exposes restaurants, menus, availability, reservation previews,
    confirmed idempotent reservations, cancellation previews, credit balances and
    campaign previews. Autonomous offer or campaign execution remains outside v1.
servers:
  - url: https://www.thetok.ch/functions/v1/tok-connect-api
    description: Production edge API
  - url: https://cloud-rebuild-recovered.vercel.app/functions/v1/tok-connect-api
    description: Current production frontend target
security:
  - bearerAuth: []
tags:
  - name: Restaurants
  - name: Reservations
  - name: Credits
  - name: Campaigns
  - name: Webhooks
paths:
  /v1/restaurants:
    get:
      tags: [Restaurants]
      operationId: listRestaurants
      summary: List active restaurants
      description: Cursor-paginated list of public active restaurants visible to the partner.
      security:
        - bearerAuth: [restaurants:read]
      parameters:
        - $ref: "#/components/parameters/Limit"
        - $ref: "#/components/parameters/Cursor"
        - name: city
          in: query
          schema:
            type: string
          example: Geneve
        - name: cuisine
          in: query
          schema:
            type: string
          example: Italien
      responses:
        "200":
          description: Paginated restaurant list
          content:
            application/json:
              schema:
                allOf:
                  - $ref: "#/components/schemas/TokConnectEnvelope"
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          restaurants:
                            type: array
                            items:
                              $ref: "#/components/schemas/Restaurant"
              examples:
                x-tok-request-example:
                  value:
                    ok: true
                    data:
                      restaurants:
                        - id: 00000000-0000-4000-8000-000000000101
                          name: TOK Sandbox Brasserie
                          cuisine_type: Bistronomie
                          city: Geneve
                          rating: 4.8
                          supports_reservation: true
                    error: null
                    request_id: tok_req_123
                    next_cursor: null
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/MissingScope"
  /v1/restaurants/{id}:
    get:
      tags: [Restaurants]
      operationId: getRestaurant
      summary: Read one restaurant
      security:
        - bearerAuth: [restaurants:read]
      parameters:
        - $ref: "#/components/parameters/RestaurantId"
      responses:
        "200":
          description: Restaurant profile
          content:
            application/json:
              schema:
                allOf:
                  - $ref: "#/components/schemas/TokConnectEnvelope"
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          restaurant:
                            $ref: "#/components/schemas/Restaurant"
        "404":
          $ref: "#/components/responses/NotFound"
  /v1/restaurants/{id}/menu:
    get:
      tags: [Restaurants]
      operationId: getRestaurantMenu
      summary: Read restaurant menu
      security:
        - bearerAuth: [restaurants:read]
      parameters:
        - $ref: "#/components/parameters/RestaurantId"
        - $ref: "#/components/parameters/Limit"
      responses:
        "200":
          description: Menu items
          content:
            application/json:
              schema:
                allOf:
                  - $ref: "#/components/schemas/TokConnectEnvelope"
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          restaurant_id:
                            type: string
                            format: uuid
                          items:
                            type: array
                            items:
                              $ref: "#/components/schemas/MenuItem"
  /v1/restaurants/{id}/availability:
    get:
      tags: [Restaurants]
      operationId: getRestaurantAvailability
      summary: Read real-time availability
      security:
        - bearerAuth: [availability:read]
      parameters:
        - $ref: "#/components/parameters/RestaurantId"
        - name: date
          in: query
          required: true
          schema:
            type: string
            format: date
          example: "2026-06-26"
        - name: party_size
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 20
          example: 2
      responses:
        "200":
          description: Available slots
          content:
            application/json:
              schema:
                allOf:
                  - $ref: "#/components/schemas/TokConnectEnvelope"
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          restaurant_id:
                            type: string
                            format: uuid
                          date:
                            type: string
                            format: date
                          slots:
                            type: array
                            items:
                              $ref: "#/components/schemas/AvailabilitySlot"
  /v1/reservations/preview:
    post:
      tags: [Reservations]
      operationId: previewReservation
      summary: Prepare a reservation without mutation
      security:
        - bearerAuth: [reservations:create]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ReservationPreviewRequest"
            examples:
              x-tok-request-example:
                value:
                  restaurant_id: 00000000-0000-4000-8000-000000000101
                  date: "2026-06-26"
                  time: "19:30"
                  party_size: 2
                  feature: classique
      responses:
        "200":
          description: Reservation preview
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ReservationPreviewEnvelope"
  /v1/reservations:
    post:
      tags: [Reservations]
      operationId: createReservation
      summary: Create a confirmed idempotent reservation
      description: Requires Idempotency-Key and confirmed_by=end_user. Reusing the same key with another body returns idempotency_key_reused_with_different_body.
      security:
        - bearerAuth: [reservations:create]
      parameters:
        - name: Idempotency-Key
          in: header
          required: true
          schema:
            type: string
            minLength: 8
            maxLength: 120
            pattern: "^[A-Za-z0-9:_-]+$"
          example: booking_20260626_partner_abc123
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ReservationCreateRequest"
            examples:
              x-tok-request-example:
                value:
                  restaurant_id: 00000000-0000-4000-8000-000000000101
                  date: "2026-06-26"
                  time: "19:30"
                  party_size: 2
                  confirmed_by: end_user
                  notes: Table calme si possible
      responses:
        "201":
          description: Confirmed reservation
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ReservationEnvelope"
        "409":
          description: Confirmation or idempotency conflict
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorEnvelope"
              examples:
                reusedKey:
                  value:
                    ok: false
                    data: null
                    error:
                      code: idempotency_key_reused_with_different_body
                      message: idempotency_key_reused_with_different_body
                    request_id: tok_req_123
                    next_cursor: null
  /v1/reservations/{id}/cancel/preview:
    post:
      tags: [Reservations]
      operationId: previewReservationCancellation
      summary: Preview cancellation without mutation
      security:
        - bearerAuth: [reservations:cancel]
      parameters:
        - $ref: "#/components/parameters/ReservationId"
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ReservationCancellationPreviewRequest"
      responses:
        "200":
          description: Cancellation preview
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CancellationPreviewEnvelope"
  /v1/reservations/{id}/cancel:
    post:
      tags: [Reservations]
      operationId: cancelReservation
      summary: Cancel a TOK Connect reservation after explicit end-user confirmation
      description: Only reservations created by the same TOK Connect partner can be cancelled. Requires Idempotency-Key and confirmed_by=end_user.
      security:
        - bearerAuth: [reservations:cancel]
      parameters:
        - $ref: "#/components/parameters/ReservationId"
        - name: Idempotency-Key
          in: header
          required: true
          schema:
            type: string
            minLength: 8
            maxLength: 120
            pattern: "^[A-Za-z0-9:_-]+$"
          example: cancel_20260626_partner_abc123
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ReservationCancellationRequest"
            examples:
              x-tok-request-example:
                value:
                  confirmed_by: end_user
                  reason_code: customer_cancelled
                  reason: Client request from partner checkout
      responses:
        "200":
          description: Cancelled reservation or idempotent replay
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ReservationCancellationEnvelope"
        "403":
          description: Reservation was not created by this TOK Connect partner
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorEnvelope"
              examples:
                notOwned:
                  value:
                    ok: false
                    data: null
                    error:
                      code: tok_connect_reservation_not_owned
                      message: tok_connect_reservation_not_owned
                    request_id: tok_req_123
                    next_cursor: null
        "409":
          description: Missing confirmation, invalid state or idempotency conflict
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorEnvelope"
              examples:
                missingConfirmation:
                  value:
                    ok: false
                    data: null
                    error:
                      code: end_user_cancellation_confirmation_required
                      message: end_user_cancellation_confirmation_required
                    request_id: tok_req_123
                    next_cursor: null
  /v1/credits/balance:
    get:
      tags: [Credits]
      operationId: getCreditBalance
      summary: Read partner credit balance
      security:
        - bearerAuth: [credits:read]
      parameters:
        - name: restaurant_id
          in: query
          required: false
          schema:
            type: string
            format: uuid
          description: When omitted, TOK aggregates active restaurant grants for the partner, capped at 50 restaurants.
      responses:
        "200":
          description: Credit balance
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CreditBalanceEnvelope"
  /v1/campaigns/preview:
    post:
      tags: [Campaigns]
      operationId: previewCampaign
      summary: Generate a human-approved campaign preview
      security:
        - bearerAuth: [campaigns:preview]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CampaignPreviewRequest"
            examples:
              x-tok-request-example:
                value:
                  restaurant_id: 00000000-0000-4000-8000-000000000101
                  objective: Remplir le service du midi
                  budget_chf: 100
      responses:
        "200":
          description: Campaign preview, not publication
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CampaignPreviewEnvelope"
  /v1/autopilot/plan:
    post:
      tags: [Campaigns]
      operationId: buildAutopilotPlan
      summary: Build a bounded Autopilot plan for human approval
      description: Creates a tok_connect_agent_runs entry in pending_approval. It does not publish campaigns, create offers or spend credits.
      security:
        - bearerAuth: [autopilot:plan, analytics:read, campaigns:preview]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/AutopilotPlanRequest"
            examples:
              x-tok-request-example:
                value:
                  restaurant_id: 00000000-0000-4000-8000-000000000101
                  objective: Remplir le jeudi soir
                  budget_chf: 120
                  requested_actions: [campaign_preview, reservation_recommendation]
      responses:
        "202":
          description: Bounded Autopilot plan awaiting approval
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AutopilotPlanEnvelope"
webhooks:
  reservationCreated:
    post:
      tags: [Webhooks]
      operationId: webhookReservationCreated
      summary: reservation.created
      parameters:
        - $ref: "#/components/parameters/TokEventHeader"
        - $ref: "#/components/parameters/TokDeliveryHeader"
        - $ref: "#/components/parameters/TokTimestampHeader"
        - $ref: "#/components/parameters/TokSignatureHeader"
      requestBody:
        required: true
        content:
          application/json:
              schema:
                $ref: "#/components/schemas/WebhookReservationCreated"
  reservationCancelled:
    post:
      tags: [Webhooks]
      operationId: webhookReservationCancelled
      summary: reservation.cancelled
      parameters:
        - $ref: "#/components/parameters/TokEventHeader"
        - $ref: "#/components/parameters/TokDeliveryHeader"
        - $ref: "#/components/parameters/TokTimestampHeader"
        - $ref: "#/components/parameters/TokSignatureHeader"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/WebhookReservationCancelled"
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: opaque
      description: OAuth 2.0 client-credentials token minted by tok-connect-oauth.
  parameters:
    Limit:
      name: limit
      in: query
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 25
    Cursor:
      name: cursor
      in: query
      schema:
        type: string
    RestaurantId:
      name: id
      in: path
      required: true
      schema:
        type: string
        format: uuid
    ReservationId:
      name: id
      in: path
      required: true
      schema:
        type: string
        format: uuid
    TokEventHeader:
      name: X-TOK-Event
      in: header
      required: true
      schema:
        type: string
        enum: [reservation.created, reservation.cancelled, webhook.test, campaign.previewed]
    TokDeliveryHeader:
      name: X-TOK-Delivery
      in: header
      required: true
      schema:
        type: string
        format: uuid
    TokTimestampHeader:
      name: X-TOK-Timestamp
      in: header
      required: true
      schema:
        type: string
        format: date-time
    TokSignatureHeader:
      name: X-TOK-Signature
      in: header
      required: true
      schema:
        type: string
        pattern: "^v1=[A-Za-z0-9_-]+$"
  responses:
    Unauthorized:
      description: Missing, expired or revoked opaque token
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorEnvelope"
    MissingScope:
      description: Token lacks the required scope or restaurant grant
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorEnvelope"
    NotFound:
      description: Requested resource was not found
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorEnvelope"
  schemas:
    TokConnectError:
      type: object
      required: [code, message]
      properties:
        code:
          type: string
          examples: [missing_scope, restaurant_not_found, idempotency_key_reused_with_different_body]
        message:
          type: string
    TokConnectEnvelope:
      type: object
      required: [ok, data, error, request_id, next_cursor]
      properties:
        ok:
          type: boolean
        data:
          oneOf:
            - type: object
            - type: "null"
        error:
          oneOf:
            - $ref: "#/components/schemas/TokConnectError"
            - type: "null"
        request_id:
          type: string
        next_cursor:
          oneOf:
            - type: string
            - type: "null"
    ErrorEnvelope:
      allOf:
        - $ref: "#/components/schemas/TokConnectEnvelope"
    Restaurant:
      type: object
      required: [id, name]
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        description:
          type: string
        cuisine_type:
          type: string
        address:
          type: string
        city:
          type: string
        rating:
          type: number
        review_count:
          type: integer
        price_range:
          type: integer
        image_url:
          type: string
        supports_reservation:
          type: boolean
    MenuItem:
      type: object
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        description:
          type: string
        price:
          type: number
        category:
          type: string
        image_url:
          type: string
        is_available:
          type: boolean
    AvailabilitySlot:
      type: object
      properties:
        slot_time:
          type: string
          example: "19:30"
        service:
          type: string
          enum: [lunch, dinner]
        remaining_tables:
          type: integer
        available:
          type: boolean
    ReservationPreviewRequest:
      type: object
      required: [restaurant_id, date, time, party_size]
      properties:
        restaurant_id:
          type: string
          format: uuid
        date:
          type: string
          format: date
        time:
          type: string
          pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$"
        party_size:
          type: integer
          minimum: 1
          maximum: 20
        feature:
          type: string
          default: classique
        notes:
          type: string
    ReservationCreateRequest:
      allOf:
        - $ref: "#/components/schemas/ReservationPreviewRequest"
        - type: object
          required: [confirmed_by]
          properties:
            confirmed_by:
              type: string
              enum: [end_user]
            metadata:
              type: object
              additionalProperties: true
    Reservation:
      type: object
      required: [id, status, restaurant_id, date, time, party_size]
      properties:
        id:
          type: string
          format: uuid
        status:
          type: string
          examples: [confirmed, cancelled]
        restaurant_id:
          type: string
          format: uuid
        date:
          type: string
          format: date
        time:
          type: string
        party_size:
          type: integer
        cancelled_at:
          type: string
          format: date-time
        already_cancelled:
          type: boolean
    ReservationPreviewEnvelope:
      allOf:
        - $ref: "#/components/schemas/TokConnectEnvelope"
    ReservationEnvelope:
      allOf:
        - $ref: "#/components/schemas/TokConnectEnvelope"
    ReservationCancellationPreviewRequest:
      type: object
      properties:
        restaurant_id:
          type: string
          format: uuid
        reason:
          type: string
    CancellationPreviewEnvelope:
      allOf:
        - $ref: "#/components/schemas/TokConnectEnvelope"
    ReservationCancellationRequest:
      type: object
      required: [confirmed_by]
      properties:
        confirmed_by:
          type: string
          enum: [end_user]
        reason_code:
          type: string
          maxLength: 64
          default: customer_cancelled
        reason:
          type: string
          maxLength: 500
    ReservationCancellationEnvelope:
      allOf:
        - $ref: "#/components/schemas/TokConnectEnvelope"
    CreditBalanceEnvelope:
      allOf:
        - $ref: "#/components/schemas/TokConnectEnvelope"
    CampaignPreviewRequest:
      type: object
      required: [restaurant_id, objective]
      properties:
        restaurant_id:
          type: string
          format: uuid
        objective:
          type: string
        budget_chf:
          type: number
          minimum: 0
    CampaignPreviewEnvelope:
      allOf:
        - $ref: "#/components/schemas/TokConnectEnvelope"
    AutopilotPlanRequest:
      type: object
      required: [restaurant_id, objective]
      properties:
        restaurant_id:
          type: string
          format: uuid
        objective:
          type: string
          maxLength: 240
        budget_chf:
          type: number
          minimum: 0
        requested_actions:
          type: array
          items:
            type: string
            enum: [campaign_preview, reservation_recommendation, availability_alert]
        approval_mode:
          type: string
          enum: [human_required, manual_review]
          default: human_required
    AutopilotPlanEnvelope:
      allOf:
        - $ref: "#/components/schemas/TokConnectEnvelope"
    WebhookReservationCreated:
      type: object
      required: [event, reservation_id, restaurant_id, request_id]
      properties:
        event:
          type: string
          const: reservation.created
        reservation_id:
          type: string
          format: uuid
        restaurant_id:
          type: string
          format: uuid
        request_id:
          type: string
    WebhookReservationCancelled:
      type: object
      required: [event, reservation_id, restaurant_id, request_id]
      properties:
        event:
          type: string
          const: reservation.cancelled
        reservation_id:
          type: string
          format: uuid
        restaurant_id:
          type: string
          format: uuid
        request_id:
          type: string
        reason_code:
          type: string
`;
