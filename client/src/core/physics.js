import RAPIER from '@dimforge/rapier3d-compat'

/**
 * Rapier world plus a kinematic character controller.
 *
 * World gravity is zero on purpose: gravity lives in shared/movement.js so the
 * server computes it identically. Rapier is used here only to answer "how far
 * can this capsule actually move", never to decide how fast it should move.
 */
export async function createPhysics() {
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })

  return {
    world,
    RAPIER,

    /**
     * Add a static box collider.
     *
     * @param {{ half: {x:number,y:number,z:number}, position: {x:number,y:number,z:number},
     *           rotation?: {x:number,y:number,z:number,w:number} }} box
     */
    addStaticBox(box) {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
        box.position.x,
        box.position.y,
        box.position.z
      )
      if (box.rotation) bodyDesc.setRotation(box.rotation)

      const body = world.createRigidBody(bodyDesc)
      const colliderDesc = RAPIER.ColliderDesc.cuboid(box.half.x, box.half.y, box.half.z)
      return world.createCollider(colliderDesc, body)
    },

    /**
     * Create the player capsule and its controller.
     *
     * Rapier measures a capsule by the half-height of its cylindrical section,
     * excluding the two hemispherical caps, so total height is
     * 2 * halfHeight + 2 * radius.
     *
     * @param {{ position: {x:number,y:number,z:number}, height: number, radius: number,
     *           stepHeight: number, slopeLimitRad: number }} opts
     */
    createCharacter(opts) {
      const halfHeight = halfHeightFor(opts.height, opts.radius)
      const centreY = opts.position.y + opts.height / 2

      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
          opts.position.x,
          centreY,
          opts.position.z
        )
      )
      const collider = world.createCollider(
        RAPIER.ColliderDesc.capsule(halfHeight, opts.radius),
        body
      )

      const controller = world.createCharacterController(0.01)
      controller.setUp({ x: 0, y: 1, z: 0 })
      controller.setMaxSlopeClimbAngle(opts.slopeLimitRad)
      // Slightly under the climb limit: a surface too steep to walk up should
      // slide, not hold the player still.
      controller.setMinSlopeSlideAngle(opts.slopeLimitRad * 0.9)
      controller.enableAutostep(opts.stepHeight, opts.radius * 0.5, true)
      // Snap distance must stay BELOW a single step rise. At or above it, the
      // controller can autostep up and then immediately snap back down onto the
      // stair it just left.
      opts.snapDistance = opts.stepHeight * 0.5
      controller.enableSnapToGround(opts.snapDistance)
      controller.setApplyImpulsesToDynamicBodies(false)

      return {
        body,
        collider,
        controller,

        /**
         * Resolve a desired translation against the world.
         *
         * @param {{x:number,y:number,z:number}} desired
         * @param {boolean} noSnap disable snap-to-ground for this step
         * @returns {{ movement: {x:number,y:number,z:number}, grounded: boolean }}
         */
        move(desired, noSnap) {
          // Snap-to-ground has to be off in two cases, or it undoes legitimate
          // upward motion:
          //
          //  - during a jump, where it would cancel the jump on its first step
          //  - on the step after an autostep, where it finds the LOWER stair
          //    still within snapping range and pulls the capsule back down
          //
          // The second case produced a visible oscillation: up 0.06, down 0.10,
          // up 0.11, with the controller pushing backward on alternate ticks.
          if (noSnap) controller.disableSnapToGround()
          else controller.enableSnapToGround(opts.snapDistance)

          controller.computeColliderMovement(collider, desired)
          const movement = controller.computedMovement()

          return {
            movement: { x: movement.x, y: movement.y, z: movement.z },
            grounded: controller.computedGrounded(),
          }
        },

        /**
         * Move the capsule so its FEET sit at this position.
         * @param {{x:number,y:number,z:number}} feet
         * @param {number} height current capsule height
         */
        setFeetPosition(feet, height) {
          body.setNextKinematicTranslation({
            x: feet.x,
            y: feet.y + height / 2,
            z: feet.z,
          })
        },

        /**
         * Resize the capsule for crouching. The feet stay put; the caller
         * repositions the body straight after.
         * @param {number} height
         */
        setHeight(height) {
          collider.setHalfHeight(halfHeightFor(height, opts.radius))
        },
      }
    },

    /**
     * Distance to the first solid surface along a ray, or null if nothing is
     * hit within maxDistance.
     *
     * Used by the third-person spring arm to keep the camera out of walls.
     *
     * @param {{x:number,y:number,z:number}} origin
     * @param {{x:number,y:number,z:number}} direction must be normalised
     * @param {number} maxDistance
     * @param {any} [exclude] collider to ignore, normally the player's own capsule
     * @returns {number|null}
     */
    castRay(origin, direction, maxDistance, exclude) {
      const ray = new RAPIER.Ray(origin, direction)
      const hit = world.castRay(ray, maxDistance, true, undefined, undefined, exclude)
      return hit ? hit.timeOfImpact : null
    },

    step() {
      world.step()
    },
  }
}

/** @param {number} height @param {number} radius */
function halfHeightFor(height, radius) {
  // Guard against a capsule shorter than its own caps, which Rapier rejects.
  return Math.max(0.01, height / 2 - radius)
}
